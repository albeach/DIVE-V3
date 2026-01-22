import { Collection, Db, MongoClient, ObjectId } from 'mongodb';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { logger } from '../utils/logger';

export type NotificationType =
    | 'access_granted'
    | 'access_denied'
    | 'document_shared'
    | 'upload_complete'
    | 'system'
    | 'security'
    | 'federation_event'
    | 'admin_action';

export interface INotification {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
    resourceId?: string;
    actionUrl?: string;
    severity?: 'info' | 'success' | 'warning' | 'error';
    priority?: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
}

interface IListResult {
    notifications: INotification[];
    unreadCount: number;
    nextCursor: string | null;
}

const COLLECTION = process.env.NOTIFICATIONS_COLLECTION || 'notifications';
const PREFS_COLLECTION = process.env.NOTIFICATIONS_PREFS_COLLECTION || 'notification_prefs';

export interface INotificationPreferences {
    userId: string;
    emailOptIn: boolean;
    updatedAt?: Date;
    createdAt?: Date;
}

class NotificationService {
    private client: MongoClient | null = null;
    private db: Db | null = null;

    private async connect(): Promise<void> {
        if (this.client && this.db) return;

        const url = getMongoDBUrl();
        this.client = new MongoClient(url);
        await this.client.connect();
        this.db = this.client.db(getMongoDBName());
    }

    private async collection(): Promise<Collection> {
        await this.connect();
        if (!this.db) throw new Error('Database not initialized');
        const col = this.db.collection(COLLECTION);
        // Ensure indexes for performance
        await col.createIndex({ userId: 1, read: 1, timestamp: -1 });
        return col;
    }

    async list(userId: string, limit: number = 50, cursor?: string): Promise<IListResult> {
        const col = await this.collection();
        const query: any = { userId };
        if (cursor) {
            try {
                query._id = { $lt: new ObjectId(cursor) };
            } catch (err) {
                logger.warn('Invalid cursor provided for notifications', { cursor });
            }
        }

        const docs = await col
            .find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .toArray();

        const unreadCount = await col.countDocuments({ userId, read: false });
        const nextCursor = docs.length === limit ? docs[docs.length - 1]._id.toString() : null;

        const notifications: INotification[] = docs.map((doc: any) => ({
            id: doc._id.toString(),
            userId: doc.userId,
            type: doc.type,
            title: doc.title,
            message: doc.message,
            timestamp: doc.timestamp,
            read: !!doc.read,
            resourceId: doc.resourceId,
            actionUrl: doc.actionUrl,
            severity: doc.severity,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        }));

        return { notifications, unreadCount, nextCursor };
    }

    async unreadCount(userId: string): Promise<number> {
        const col = await this.collection();
        return col.countDocuments({ userId, read: false });
    }

    async markRead(userId: string, id: string): Promise<boolean> {
        const col = await this.collection();
        const result = await col.updateOne(
            { _id: new ObjectId(id), userId },
            { $set: { read: true, updatedAt: new Date() } }
        );
        return result.matchedCount > 0;
    }

    async markAllRead(userId: string): Promise<number> {
        const col = await this.collection();
        const result = await col.updateMany(
            { userId, read: { $ne: true } },
            { $set: { read: true, updatedAt: new Date() } }
        );
        return result.modifiedCount;
    }

    async delete(userId: string, id: string): Promise<boolean> {
        const col = await this.collection();
        const result = await col.deleteOne({ _id: new ObjectId(id), userId });
        return result.deletedCount > 0;
    }

    async create(notification: Omit<INotification, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const col = await this.collection();
        const result = await col.insertOne({
            ...notification,
            read: notification.read ?? false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return result.insertedId.toString();
    }

    private async prefsCollection(): Promise<Collection> {
        await this.connect();
        if (!this.db) throw new Error('Database not initialized');
        const col = this.db.collection(PREFS_COLLECTION);
        await col.createIndex({ userId: 1 }, { unique: true });
        return col;
    }

    async getPreferences(userId: string): Promise<INotificationPreferences> {
        const col = await this.prefsCollection();
        const doc = await col.findOne({ userId });
        if (doc) {
            return {
                userId,
                emailOptIn: !!doc.emailOptIn,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
            };
        }
        return { userId, emailOptIn: false };
    }

    async upsertPreferences(userId: string, prefs: Partial<INotificationPreferences>): Promise<INotificationPreferences> {
        const col = await this.prefsCollection();
        const update = {
            $set: {
                emailOptIn: prefs.emailOptIn ?? false,
                updatedAt: new Date(),
            },
            $setOnInsert: {
                createdAt: new Date(),
            },
        };
        await col.updateOne({ userId }, update, { upsert: true });
        return this.getPreferences(userId);
    }

    /**
     * Create admin notification (sent to all Hub admin users)
     * 
     * Phase 2: Gap Closure - Admin awareness of pending spoke registrations
     * 
     * This method finds all users with 'hub_admin' or 'super_admin' roles
     * and creates a notification for each.
     * 
     * @param notification - Notification details (without userId)
     */
    async createAdminNotification(notification: {
        type: NotificationType;
        title: string;
        message: string;
        actionUrl?: string;
        priority?: 'low' | 'medium' | 'high' | 'critical';
        metadata?: Record<string, unknown>;
    }): Promise<string[]> {
        try {
            // Get all admin users
            const adminUsers = await this.getAdminUsers();
            
            if (adminUsers.length === 0) {
                logger.warn('No admin users found - cannot create admin notification', {
                    title: notification.title
                });
                return [];
            }

            // Create notification for each admin
            const notificationIds: string[] = [];
            const timestamp = new Date().toISOString();

            for (const adminUserId of adminUsers) {
                const id = await this.create({
                    userId: adminUserId,
                    type: notification.type,
                    title: notification.title,
                    message: notification.message,
                    timestamp,
                    read: false,
                    actionUrl: notification.actionUrl,
                    severity: this.priorityToSeverity(notification.priority),
                    priority: notification.priority,
                    metadata: notification.metadata
                });
                notificationIds.push(id);
            }

            logger.info('Admin notification created for all admins', {
                title: notification.title,
                adminCount: adminUsers.length,
                notificationIds: notificationIds.length,
                priority: notification.priority
            });

            return notificationIds;

        } catch (error) {
            logger.error('Failed to create admin notification', {
                title: notification.title,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Get all admin user IDs
     * Queries user collection for users with hub_admin or super_admin roles
     */
    private async getAdminUsers(): Promise<string[]> {
        try {
            await this.connect();
            if (!this.db) return [];

            const usersCollection = this.db.collection('users');
            
            // Find users with admin roles
            const adminDocs = await usersCollection.find({
                $or: [
                    { roles: 'hub_admin' },
                    { roles: 'super_admin' },
                    { role: 'hub_admin' },
                    { role: 'super_admin' }
                ]
            }).toArray();

            // Extract uniqueID from admin users
            const adminUserIds = adminDocs
                .map(doc => doc.uniqueID || doc.email || doc.username)
                .filter(id => !!id) as string[];

            logger.debug('Found admin users for notifications', {
                count: adminUserIds.length
            });

            return adminUserIds;

        } catch (error) {
            logger.warn('Failed to fetch admin users', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            // Return empty array if can't fetch admins
            return [];
        }
    }

    /**
     * Map priority to severity
     */
    private priorityToSeverity(priority?: string): 'info' | 'success' | 'warning' | 'error' {
        switch (priority) {
            case 'critical':
                return 'error';
            case 'high':
                return 'warning';
            case 'medium':
                return 'info';
            case 'low':
            default:
                return 'info';
        }
    }
}

export const notificationService = new NotificationService();
