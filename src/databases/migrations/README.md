# Database Migrations

This directory contains the database migration system for the DeepSpot application. The migration system provides a robust way to manage database schema changes with support for both applying and rolling back migrations.

## Overview

The migration system consists of:

- **Migration Interface**: Defines the contract for all migrations
- **BaseMigration Class**: Abstract base class with common functionality
- **MigrationManager**: Handles migration execution and tracking
- **MigrationUtils**: Utility functions for migration management
- **Migration Script**: Command-line tool for running migrations

## Quick Start

### 1. Environment Setup

Make sure you have the following environment variables set in your `.env` file:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=deepspot
DB_USER=postgres
DB_PASSWORD=your_password
```

### 2. Available Commands

```bash
# Apply all pending migrations
npm run migrate:up

# Rollback the last migration
npm run migrate:down

# Rollback the last N migrations
npm run migrate:down 3

# Show migration status
npm run migrate:status

# Create a new migration
npm run migrate:create "add user roles"
```

## Creating Migrations

### Method 1: Using the Migration Script

```bash
npm run migrate:create "create products table"
```

This will generate a template and show you the next steps.

### Method 2: Manual Creation

Create a new file in the migrations directory following this pattern:

```typescript
import { BaseMigration } from './index';
import { BaseDatabaseClient } from '../base-database';

export class CreateProductsTableMigration extends BaseMigration {
  id = 'create_products_table';
  name = 'Create Products Table';
  description = 'Creates the products table with basic product information';
  version = '002';
  timestamp = new Date('2024-01-02T00:00:00Z');

  async up(client: BaseDatabaseClient): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await client.executeQuery(createTableQuery);
  }

  async down(client: BaseDatabaseClient): Promise<void> {
    const dropTableQuery = `DROP TABLE IF EXISTS products`;
    await client.executeQuery(dropTableQuery);
  }
}
```

### 3. Register the Migration

Add your migration to the `registerMigrations()` method in `migrate.ts`:

```typescript
private registerMigrations(): void {
  this.manager.register(new CreateUsersTableMigration());
  this.manager.register(new CreateProductsTableMigration()); // Add your migration here
}
```

## Migration Best Practices

### 1. Naming Conventions

- Use descriptive names: `create_users_table`, `add_user_roles`, `update_product_pricing`
- Use snake_case for IDs
- Use PascalCase for class names

### 2. Versioning

- Use sequential version numbers: `001`, `002`, `003`
- Or use timestamps: `20240101_120000`

### 3. Up and Down Methods

- **Up Method**: Should be idempotent (safe to run multiple times)
- **Down Method**: Should completely reverse the up method
- Use `IF NOT EXISTS` and `IF EXISTS` clauses when possible

### 4. Error Handling

The migration system automatically handles errors and provides detailed logging. If a migration fails:

1. The error is logged
2. Execution stops
3. No further migrations are applied
4. The database remains in a consistent state

### 5. Database-Specific Considerations

#### PostgreSQL

```typescript
// Good: Use PostgreSQL-specific features
const query = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

// Good: Use proper rollback
const rollbackQuery = `DROP TABLE IF EXISTS users`;
```

#### BigQuery

```typescript
// Good: Use BigQuery-specific syntax
const query = `
  CREATE TABLE IF NOT EXISTS \`project.dataset.users\` (
    id INT64,
    email STRING,
    created_at TIMESTAMP
  )
`;
```

## Migration Status

The system tracks migration status in a `migrations` table:

```sql
CREATE TABLE migrations (
  id VARCHAR(255) PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(100) NOT NULL
);
```

## Troubleshooting

### Common Issues

1. **Migration Already Applied**: The system prevents duplicate migrations
2. **Database Connection**: Ensure your database credentials are correct
3. **Permission Issues**: Ensure your database user has CREATE/DROP permissions

### Debugging

Use the status command to see what's happening:

```bash
npm run migrate:status
```

### Manual Rollback

If you need to manually rollback a migration:

1. Check the migration status
2. Identify the migration to rollback
3. Run: `npm run migrate:down 1`

## Advanced Usage

### Custom Migration Logic

You can implement complex migration logic:

```typescript
async up(client: BaseDatabaseClient): Promise<void> {
  // Create table
  await client.executeQuery(`CREATE TABLE users (...)`);
  
  // Insert initial data
  await client.executeQuery(`
    INSERT INTO users (email, name) 
    VALUES ($1, $2)
  `, ['admin@example.com', 'Admin User']);
  
  // Create indexes
  await client.executeQuery(`CREATE INDEX idx_users_email ON users(email)`);
}
```

### Conditional Migrations

```typescript
async up(client: BaseDatabaseClient): Promise<void> {
  // Check if column exists before adding
  const result = await client.executeQuery(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'phone'
  `);
  
  if (result.length === 0) {
    await client.executeQuery(`ALTER TABLE users ADD COLUMN phone VARCHAR(20)`);
  }
}
```

## Integration with CI/CD

Add migration commands to your deployment pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run Database Migrations
  run: |
    npm run migrate:up
  env:
    DB_HOST: ${{ secrets.DB_HOST }}
    DB_NAME: ${{ secrets.DB_NAME }}
    DB_USER: ${{ secrets.DB_USER }}
    DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
```

## Support

For issues or questions about the migration system:

1. Check the migration status: `npm run migrate:status`
2. Review the logs for detailed error messages
3. Ensure your database connection is working
4. Verify that all migrations are properly registered
