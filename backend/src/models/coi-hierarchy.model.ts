/**
 * DIVE V3 - COI Hierarchy MongoDB Model
 *
 * Manages hierarchical relationships between Communities of Interest (COI).
 * Supports multi-level hierarchies with transitive closure for fast lookups.
 *
 * Collection: coi_hierarchy
 *
 * Features:
 * - Multi-level parent-child relationships
 * - Pre-computed transitive closure (ancestors/descendants)
 * - Conditional activation (time-based, context-based)
 * - Hybrid approach: Critical hierarchies in static Rego, extended in MongoDB
 *
 * @version 2.0.0
 * @date 2026-01-25
 */

import { Collection, Db, MongoClient } from 'mongodb';
import { logger } from '../utils/logger';
import { connectToMongoDBWithRetry, retryMongoOperation } from '../utils/mongodb-connection';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_COI_HIERARCHY = 'coi_hierarchy';

/**
 * COI Hierarchy Node Document
 */
export interface ICoiHierarchyNode {
  coiId: string; // Unique identifier (NATO, FVEY, FRA-US, etc.)
  name: string; // Display name
  description?: string;
  type: 'alliance' | 'regional' | 'bilateral' | 'program' | 'root';
  level: number; // 0=root, 1=alliance, 2=regional, 3=bilateral, 4=program

  // Relationships
  parentId: string | null; // Direct parent (null for root nodes)
  children: string[]; // Direct children IDs
  ancestors: string[]; // All ancestor IDs (for fast lookup)
  descendants: string[]; // All descendant IDs (transitive closure)

  // Status
  enabled: boolean;

  // Conditional activation
  conditional?: {
    timeWindow?: {
      start: string; // ISO 8601
      end: string; // ISO 8601
    };
    context?: string; // Rego expression to evaluate
    classification?: string; // Required classification level
    operation?: string; // Required operation type (read, write)
  };

  // Metadata
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string;
    lastModifiedBy?: string;
    source: 'static' | 'dynamic' | 'admin';
    version: number;
  };
}

/**
 * Query parameters for hierarchy nodes
 */
export interface IHierarchyNodeQuery {
  coiId?: string;
  type?: ICoiHierarchyNode['type'];
  level?: number;
  parentId?: string;
  enabled?: boolean;
  source?: ICoiHierarchyNode['metadata']['source'];
}

/**
 * MongoDB store for COI hierarchy
 */
export class MongoCoiHierarchyStore {
  private db: Db | null = null;
  private client: MongoClient | null = null;
  private collection: Collection<ICoiHierarchyNode> | null = null;
  private initialized = false;

  /**
   * Initialize MongoDB connection and indexes
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.client = await connectToMongoDBWithRetry(MONGODB_URL);
      this.db = this.client.db(DB_NAME);
      this.collection = this.db.collection<ICoiHierarchyNode>(COLLECTION_COI_HIERARCHY);

      // Create indexes with retry logic
      await retryMongoOperation(async () => {
        await this.collection!.createIndex({ coiId: 1 }, { unique: true });
        await this.collection!.createIndex({ type: 1 });
        await this.collection!.createIndex({ level: 1 });
        await this.collection!.createIndex({ parentId: 1 });
        await this.collection!.createIndex({ enabled: 1 });
        await this.collection!.createIndex({ 'metadata.source': 1 });
        await this.collection!.createIndex({ ancestors: 1 });
        await this.collection!.createIndex({ descendants: 1 });
      });

      this.initialized = true;
      logger.info('MongoDB COI Hierarchy Store initialized', {
        database: DB_NAME,
        collection: COLLECTION_COI_HIERARCHY
      });
    } catch (error) {
      logger.error('Failed to initialize MongoDB COI Hierarchy Store', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  /**
   * Create a new hierarchy node
   */
  async create(node: Omit<ICoiHierarchyNode, 'metadata'>, createdBy?: string): Promise<ICoiHierarchyNode> {
    await this.ensureInitialized();

    const doc: ICoiHierarchyNode = {
      ...node,
      ancestors: node.ancestors || [],
      descendants: node.descendants || [],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
        source: node.parentId ? 'dynamic' : 'static',
        version: 1
      }
    };

    await this.collection!.insertOne(doc as any);

    logger.info('COI hierarchy node created', {
      coiId: node.coiId,
      type: node.type,
      level: node.level,
      createdBy
    });

    return doc;
  }

  /**
   * Update an existing hierarchy node
   */
  async update(
    coiId: string,
    updates: Partial<Omit<ICoiHierarchyNode, 'coiId' | 'metadata'>>,
    modifiedBy?: string
  ): Promise<ICoiHierarchyNode | null> {
    await this.ensureInitialized();

    const existing = await this.collection!.findOne({ coiId });
    if (!existing) return null;

    const result = await this.collection!.findOneAndUpdate(
      { coiId },
      {
        $set: {
          ...updates,
          'metadata.updatedAt': new Date(),
          'metadata.lastModifiedBy': modifiedBy,
          'metadata.version': existing.metadata.version + 1
        }
      },
      { returnDocument: 'after' }
    );

    logger.info('COI hierarchy node updated', {
      coiId,
      modifiedBy,
      version: existing.metadata.version + 1
    });

    return result || null;
  }

  /**
   * Find hierarchy node by ID
   */
  async findById(coiId: string): Promise<ICoiHierarchyNode | null> {
    await this.ensureInitialized();
    return this.collection!.findOne({ coiId });
  }

  /**
   * Find all hierarchy nodes matching query
   */
  async find(query: IHierarchyNodeQuery = {}): Promise<ICoiHierarchyNode[]> {
    await this.ensureInitialized();

    const filter: any = {};
    if (query.coiId) filter.coiId = query.coiId;
    if (query.type) filter.type = query.type;
    if (query.level !== undefined) filter.level = query.level;
    if (query.parentId !== undefined) filter.parentId = query.parentId;
    if (query.enabled !== undefined) filter.enabled = query.enabled;
    if (query.source) filter['metadata.source'] = query.source;

    return this.collection!.find(filter).toArray();
  }

  /**
   * Get all root nodes (no parent)
   */
  async findRoots(): Promise<ICoiHierarchyNode[]> {
    await this.ensureInitialized();
    return this.collection!.find({ parentId: null, enabled: true }).toArray();
  }

  /**
   * Get direct children of a node
   */
  async findChildren(coiId: string): Promise<ICoiHierarchyNode[]> {
    await this.ensureInitialized();
    return this.collection!.find({ parentId: coiId, enabled: true }).toArray();
  }

  /**
   * Get all descendants (transitive closure)
   */
  async findDescendants(coiId: string): Promise<ICoiHierarchyNode[]> {
    await this.ensureInitialized();
    const node = await this.findById(coiId);
    if (!node) return [];

    return this.collection!.find({
      coiId: { $in: node.descendants },
      enabled: true
    }).toArray();
  }

  /**
   * Get all ancestors
   */
  async findAncestors(coiId: string): Promise<ICoiHierarchyNode[]> {
    await this.ensureInitialized();
    const node = await this.findById(coiId);
    if (!node) return [];

    return this.collection!.find({
      coiId: { $in: node.ancestors },
      enabled: true
    }).toArray();
  }

  /**
   * Delete hierarchy node
   */
  async delete(coiId: string): Promise<boolean> {
    await this.ensureInitialized();

    // Check if node has children
    const children = await this.findChildren(coiId);
    if (children.length > 0) {
      throw new Error(`Cannot delete node ${coiId}: has ${children.length} children`);
    }

    const result = await this.collection!.deleteOne({ coiId });

    if (result.deletedCount === 1) {
      logger.info('COI hierarchy node deleted', { coiId });
      return true;
    }

    return false;
  }

  // ============================================
  // TRANSITIVE CLOSURE OPERATIONS
  // ============================================

  /**
   * Compute and update transitive closure for a node
   * Uses depth-first search to find all descendants and ancestors
   */
  async computeTransitiveClosure(coiId: string): Promise<void> {
    await this.ensureInitialized();

    const node = await this.findById(coiId);
    if (!node) {
      throw new Error(`Node ${coiId} not found`);
    }

    // Compute descendants (depth-first traversal)
    const descendants = await this.computeDescendants(coiId, new Set());

    // Compute ancestors (walk up the tree)
    const ancestors = await this.computeAncestors(coiId, new Set());

    // Update node
    await this.collection!.updateOne(
      { coiId },
      {
        $set: {
          descendants: Array.from(descendants),
          ancestors: Array.from(ancestors),
          'metadata.updatedAt': new Date()
        }
      }
    );

    logger.info('Transitive closure computed', {
      coiId,
      descendantCount: descendants.size,
      ancestorCount: ancestors.size
    });
  }

  private async computeDescendants(coiId: string, visited: Set<string>): Promise<Set<string>> {
    if (visited.has(coiId)) return new Set(); // Prevent cycles

    visited.add(coiId);
    const descendants = new Set<string>();

    const children = await this.findChildren(coiId);
    for (const child of children) {
      descendants.add(child.coiId);
      const childDescendants = await this.computeDescendants(child.coiId, visited);
      childDescendants.forEach(d => descendants.add(d));
    }

    return descendants;
  }

  private async computeAncestors(coiId: string, visited: Set<string>): Promise<Set<string>> {
    if (visited.has(coiId)) return new Set(); // Prevent cycles

    visited.add(coiId);
    const ancestors = new Set<string>();

    const node = await this.findById(coiId);
    if (node && node.parentId) {
      ancestors.add(node.parentId);
      const parentAncestors = await this.computeAncestors(node.parentId, visited);
      parentAncestors.forEach(a => ancestors.add(a));
    }

    return ancestors;
  }

  /**
   * Recompute transitive closure for entire hierarchy
   * Should be called after bulk updates
   */
  async recomputeAllTransitiveClosure(): Promise<void> {
    await this.ensureInitialized();

    const allNodes = await this.find({});

    logger.info('Recomputing transitive closure for all nodes', {
      nodeCount: allNodes.length
    });

    for (const node of allNodes) {
      await this.computeTransitiveClosure(node.coiId);
    }

    logger.info('Transitive closure recomputation complete');
  }

  // ============================================
  // OPA DATA EXPORT
  // ============================================

  /**
   * Build hierarchy map for OPA consumption
   * Format: { "parent_coi": ["child1", "child2", ...] }
   */
  async buildHierarchyMapForOPA(): Promise<Record<string, string[]>> {
    await this.ensureInitialized();

    const nodes = await this.find({ enabled: true });
    const map: Record<string, string[]> = {};

    for (const node of nodes) {
      if (node.children.length > 0) {
        map[node.coiId] = node.children;
      }
    }

    return map;
  }

  /**
   * Build detailed hierarchy nodes for OPA (with conditional metadata)
   * Format: { "coi_id": { children: [], conditional: {...}, ... } }
   */
  async buildDetailedHierarchyForOPA(): Promise<Record<string, any>> {
    await this.ensureInitialized();

    const nodes = await this.find({ enabled: true });
    const map: Record<string, any> = {};

    for (const node of nodes) {
      map[node.coiId] = {
        children: node.children,
        ancestors: node.ancestors,
        descendants: node.descendants,
        type: node.type,
        level: node.level,
        conditional: node.conditional || {}
      };
    }

    return map;
  }

  // ============================================
  // HIERARCHY QUERIES
  // ============================================

  /**
   * Get hierarchy path from parent to child
   * Returns all paths if multiple exist
   */
  async getHierarchyPaths(parentCoiId: string, childCoiId: string): Promise<string[][]> {
    await this.ensureInitialized();

    const paths: string[][] = [];
    await this.findPathsRecursive(parentCoiId, childCoiId, [parentCoiId], paths);
    return paths;
  }

  private async findPathsRecursive(
    currentCoiId: string,
    targetCoiId: string,
    currentPath: string[],
    paths: string[][]
  ): Promise<void> {
    if (currentCoiId === targetCoiId) {
      paths.push([...currentPath]);
      return;
    }

    const children = await this.findChildren(currentCoiId);
    for (const child of children) {
      if (!currentPath.includes(child.coiId)) { // Prevent cycles
        await this.findPathsRecursive(
          child.coiId,
          targetCoiId,
          [...currentPath, child.coiId],
          paths
        );
      }
    }
  }

  /**
   * Get full hierarchy tree structure
   */
  async getHierarchyTree(): Promise<any> {
    await this.ensureInitialized();

    const roots = await this.findRoots();
    const tree = [];

    for (const root of roots) {
      tree.push(await this.buildSubtree(root));
    }

    return tree;
  }

  private async buildSubtree(node: ICoiHierarchyNode): Promise<any> {
    const children = await this.findChildren(node.coiId);
    const childTrees = [];

    for (const child of children) {
      childTrees.push(await this.buildSubtree(child));
    }

    return {
      coiId: node.coiId,
      name: node.name,
      type: node.type,
      level: node.level,
      conditional: node.conditional,
      children: childTrees
    };
  }

  /**
   * Shutdown (close MongoDB connection)
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
      this.initialized = false;
      logger.info('MongoDB COI Hierarchy Store shutdown');
    }
  }
}

// Export singleton
export const mongoCoiHierarchyStore = new MongoCoiHierarchyStore();

export default MongoCoiHierarchyStore;
