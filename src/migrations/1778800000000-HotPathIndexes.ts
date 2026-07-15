import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds indexes for the hottest read paths so they don't sequential-scan
 * under a purchase burst:
 * - orders: buyer list / anti-flood dedup, and the stale-order expiry cron.
 * - order_items: fetched by orderId on every order read.
 * - sectors: loaded by eventId on the event page / checkout / availability.
 * - tickets: producer KPI / check-in count filtered by (eventId, status).
 *
 * Index names match the @Index decorators on the entities so TypeORM's
 * schema sync does not consider them extraneous.
 */
export class HotPathIndexes1778800000000 implements MigrationInterface {
  name = 'HotPathIndexes1778800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_user_status_reserved" ON "orders" ("userId", "status", "reservedUntil")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_status_reserved" ON "orders" ("status", "reservedUntil")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_items_orderId" ON "order_items" ("orderId")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sectors_eventId" ON "sectors" ("eventId")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tickets_event_status" ON "tickets" ("eventId", "status")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_tickets_event_status"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_sectors_eventId"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_order_items_orderId"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_orders_status_reserved"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_orders_user_status_reserved"`);
  }
}
