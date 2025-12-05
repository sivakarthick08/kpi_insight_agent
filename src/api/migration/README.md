# Migration API Documentation

This document describes the REST API endpoints for managing database migrations in the DeepSpot Query Executor.

## Overview

The Migration API provides endpoints to manage database migrations programmatically, allowing you to:
- Check migration status
- View applied and pending migrations
- Apply migrations (up)
- Rollback migrations (down)
- Manage individual migrations

## API Endpoints

### 1. Get Migration Status
**GET** `/custom/migrations/status`

Returns a summary of migration status including total, applied, and pending counts.

**Response:**
```json
{
  "success": true,
  "result": {
    "total": 5,
    "applied": 3,
    "pending": 2,
    "appliedMigrations": [...],
    "pendingMigrations": [...]
  }
}
```

### 2. Get Applied Migrations
**GET** `/custom/migrations/applied`

Returns all migrations that have been successfully applied to the database.

**Response:**
```json
{
  "success": true,
  "result": [
    {
      "id": "migration_123",
      "version": "20241201_120000",
      "name": "Create users table",
      "applied_at": "2024-12-01T12:00:00.000Z",
      "checksum": "abc123"
    }
  ]
}
```

### 3. Get Pending Migrations
**GET** `/custom/migrations/pending`

Returns all migrations that are registered but not yet applied to the database.

**Response:**
```json
{
  "success": true,
  "result": [
    {
      "id": "migration_456",
      "name": "Add user roles",
      "version": "20241201_130000",
      "description": "Add user roles table"
    }
  ]
}
```

### 4. Apply All Pending Migrations
**POST** `/custom/migrations/up`

Applies all pending migrations in order. This is equivalent to running `npm run migrate:up`.

**Response:**
```json
{
  "success": true,
  "message": "Migration completed. 2 successful, 0 failed.",
  "result": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "results": [...]
  }
}
```

### 5. Rollback Migrations
**POST** `/custom/migrations/down`

**Body:**
```json
{
  "count": 2
}
```

Rolls back the last N migrations. The `count` parameter is optional and defaults to 1.

**Response:**
```json
{
  "success": true,
  "message": "Rollback completed. 2 successful, 0 failed.",
  "result": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "results": [...]
  }
}
```

### 6. Apply Specific Migration
**POST** `/custom/migrations/apply/:id`

Applies a specific migration by its ID.

**Response:**
```json
{
  "success": true,
  "message": "Migration migration_123 applied successfully",
  "result": {
    "success": true,
    "migration": {...},
    "duration": 150
  }
}
```

### 7. Rollback Specific Migration
**POST** `/custom/migrations/rollback/:id`

Rolls back a specific migration by its ID.

**Response:**
```json
{
  "success": true,
  "message": "Migration migration_123 rolled back successfully",
  "result": {
    "success": true,
    "migration": {...},
    "duration": 120
  }
}
```

### 8. Get Specific Migration
**GET** `/custom/migrations/:id`

Returns details about a specific migration and its current status.

**Response:**
```json
{
  "success": true,
  "result": {
    "migration": {
      "id": "migration_123",
      "name": "Create users table",
      "version": "20241201_120000",
      "description": "Create users table"
    },
    "status": {
      "id": "migration_123",
      "version": "20241201_120000",
      "name": "Create users table",
      "applied_at": "2024-12-01T12:00:00.000Z",
      "checksum": "abc123"
    },
    "isApplied": true
  }
}
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (missing parameters, invalid input)
- `404` - Not Found (migration not found)
- `500` - Internal Server Error (database errors, etc.)

## Usage Examples

### Check Migration Status
```bash
curl -X GET http://localhost:3000/custom/migrations/status
```

### Apply All Pending Migrations
```bash
curl -X POST http://localhost:3000/custom/migrations/up
```

### Rollback Last 2 Migrations
```bash
curl -X POST http://localhost:3000/custom/migrations/down \
  -H "Content-Type: application/json" \
  -d '{"count": 2}'
```

### Apply Specific Migration
```bash
curl -X POST http://localhost:3000/custom/migrations/apply/migration_123
```

### Rollback Specific Migration
```bash
curl -X POST http://localhost:3000/custom/migrations/rollback/migration_123
```

## Integration with CLI

The API endpoints work alongside the existing CLI migration commands:

- `npm run migrate:up` - CLI equivalent to `POST /custom/migrations/up`
- `npm run migrate:down` - CLI equivalent to `POST /custom/migrations/down`
- `npm run migrate:status` - CLI equivalent to `GET /custom/migrations/status`

## Security Considerations

- All endpoints are accessible via the `/custom/` prefix
- Consider implementing authentication/authorization if needed
- Migration operations can be destructive - use with caution in production
- Always backup your database before running migrations

## Migration Lifecycle

1. **Registered**: Migration is defined and registered in the system
2. **Pending**: Migration is ready to be applied but hasn't been run yet
3. **Applied**: Migration has been successfully executed and recorded in the database
4. **Rolled Back**: Migration has been undone and removed from the applied list

## Best Practices

1. **Test migrations** in development/staging before production
2. **Use transactions** in your migration logic when possible
3. **Keep migrations small** and focused on single changes
4. **Document complex migrations** with clear descriptions
5. **Monitor migration execution** through the API responses
6. **Use the status endpoint** to verify migration state before operations
