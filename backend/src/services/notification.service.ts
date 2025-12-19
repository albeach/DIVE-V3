import { Collection, Db, MongoClient, ObjectId } from 'mongodb';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { logger } from '../utils/logger';

export type NotificationType =
    | 'access_granted'
    | 'access_denied'
    | 'document_shared'
    | 'upload_complete'
    | 'system'
    | 'security';

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
}

export const notificationService = new NotificationService();
