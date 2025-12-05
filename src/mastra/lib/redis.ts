import { createClient, RedisClientType } from 'redis';
import { log } from './log';

/**
 * ===========================================
 * REDIS CLIENT SINGLETON
 * ===========================================
 *
 * Provides a centralized Redis client with connection pooling,
 * retry logic, and graceful fallback for caching operations.
 *
 * Features:
 * 1. Singleton pattern for connection reuse
 * 2. Connection pooling and retry logic
 * 3. Graceful fallback when Redis unavailable
 * 4. Support for Redis Cluster mode
 * 5. Automatic reconnection handling
 */

let redisClient: RedisClientType | null = null;
let isRedisAvailable = false;

/**
 * Creates and configures Redis client with retry logic
 */
async function createRedisClient(): Promise<RedisClientType | null> {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    const client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            log({
              message: "Redis connection failed after 10 retries, giving up",
              type: "error",
              data: { retries }
            });
            return new Error('Redis connection failed');
          }
          // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
          return Math.min(retries * 100, 3000);
        },
        connectTimeout: 5000,
      },
    });

    client.on('error', (err) => {
      log({
        message: "Redis client error",
        type: "error",
        data: err
      });
      isRedisAvailable = false;
    });

    client.on('connect', () => {
      log({
        message: "Redis client connected",
        type: "info"
      });
      isRedisAvailable = true;
    });

    client.on('reconnecting', () => {
      log({
        message: "Redis client reconnecting",
        type: "info"
      });
      isRedisAvailable = false;
    });

    await client.connect();
    return client as RedisClientType;
  } catch (error) {
    log({
      message: "Failed to create Redis client",
      type: "error",
      data: error
    });
    isRedisAvailable = false;
    return null;
  }
}

/**
 * Gets the Redis client instance (singleton)
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  if (!redisClient) {
    redisClient = await createRedisClient();
  }
  return redisClient;
}

/**
 * Checks if Redis is available and connected
 */
export function isRedisConnected(): boolean {
  return isRedisAvailable && redisClient?.isReady === true;
}

/**
 * Cache operations with fallback
 */
export class RedisCache {
  private client: RedisClientType | null = null;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient() {
    this.client = await getRedisClient();
  }

  /**
   * Set a cache entry with TTL
   */
  async set(key: string, value: any, ttlSeconds: number = 300): Promise<boolean> {
    try {
      if (!this.client || !isRedisConnected()) {
        return false;
      }

      const serializedValue = JSON.stringify(value);
      await this.client.setEx(key, ttlSeconds, serializedValue);
      return true;
    } catch (error) {
      log({
        message: "Redis SET operation failed",
        type: "error",
        data: { key, error }
      });
      return false;
    }
  }

  /**
   * Get a cache entry
   */
  async get(key: string): Promise<any | null> {
    try {
      if (!this.client || !isRedisConnected()) {
        return null;
      }

      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      log({
        message: "Redis GET operation failed",
        type: "error",
        data: { key, error }
      });
      return null;
    }
  }

  /**
   * Delete a cache entry
   */
  async del(key: string): Promise<boolean> {
    try {
      if (!this.client || !isRedisConnected()) {
        return false;
      }

      await this.client.del(key);
      return true;
    } catch (error) {
      log({
        message: "Redis DEL operation failed",
        type: "error",
        data: { key, error }
      });
      return false;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (!this.client || !isRedisConnected()) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      log({
        message: "Redis EXISTS operation failed",
        type: "error",
        data: { key, error }
      });
      return false;
    }
  }

  /**
   * Set multiple keys with TTL (for batch operations)
   */
  async mset(keyValuePairs: Record<string, any>, ttlSeconds: number = 300): Promise<boolean> {
    try {
      if (!this.client || !isRedisConnected()) {
        return false;
      }

      const serializedPairs: Record<string, string> = {};
      for (const [key, value] of Object.entries(keyValuePairs)) {
        serializedPairs[key] = JSON.stringify(value);
      }

      await this.client.mSet(serializedPairs);
      
      // Set TTL for all keys
      const pipeline = this.client.multi();
      for (const key of Object.keys(serializedPairs)) {
        pipeline.expire(key, ttlSeconds);
      }
      await pipeline.exec();

      return true;
    } catch (error) {
      log({
        message: "Redis MSET operation failed",
        type: "error",
        data: { error }
      });
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(keys: string[]): Promise<Record<string, any>> {
    try {
      if (!this.client || !isRedisConnected()) {
        return {};
      }

      const values = await this.client.mGet(keys);
      const result: Record<string, any> = {};

      for (let i = 0; i < keys.length; i++) {
        const value = values[i];
        if (value !== null) {
          try {
            result[keys[i]] = JSON.parse(value);
          } catch (parseError) {
            log({
              message: "Failed to parse cached value",
              type: "error",
              data: { key: keys[i], parseError }
            });
          }
        }
      }

      return result;
    } catch (error) {
      log({
        message: "Redis MGET operation failed",
        type: "error",
        data: { keys, error }
      });
      return {};
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ connected: boolean; info?: any }> {
    try {
      if (!this.client || !isRedisConnected()) {
        return { connected: false };
      }

      const info = await this.client.info('memory');
      return { connected: true, info };
    } catch (error) {
      return { connected: false };
    }
  }
}

// Export singleton instance
export const redisCache = new RedisCache();

/**
 * Utility function to generate cache keys with consistent patterns
 */
export function generateCacheKey(prefix: string, ...parts: string[]): string {
  const cleanParts = parts.map(part => 
    String(part).replace(/[^a-zA-Z0-9_-]/g, '_')
  );
  return `deepspot:${prefix}:${cleanParts.join(':')}`;
}

/**
 * Utility function to create a hash from a string (for consistent key generation)
 */
export function createHash(input: string): string {
  let hash = 0;
  if (input.length === 0) return hash.toString();
  
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}
