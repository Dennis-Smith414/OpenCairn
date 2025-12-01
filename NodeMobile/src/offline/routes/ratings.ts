// src/offline/routes/ratings.ts
//
// React Native offline equivalents of offline/routes/ratings.js.
// No Express, no HTTP – just direct SQLite access.
//

import { dbAll, dbGet, dbRun } from "../sqlite";

const toInt = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface RatingResult {
  total: number;
  user_rating: number | null;
}

/* ============================================
 * WAYPOINT RATINGS
 * ============================================
 */

// GET Waypoint Rating (offline)
export async function getWaypointRatingOffline(
  waypointId: number,
  userId?: number | null
): Promise<RatingResult> {
  const wid = toInt(waypointId);
  const uid = userId != null ? toInt(userId) : null;

  if (!wid) {
    throw new Error("Missing or invalid waypoint id");
  }

  const totalRow = await dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(val), 0) AS total
       FROM waypoint_ratings
      WHERE waypoint_id = ?
        AND sync_status != 'deleted'`,
    [wid]
  );
  const total = totalRow?.total ?? 0;

  let user_rating: number | null = null;
  if (uid) {
    const userRow = await dbGet<{ val: number }>(
      `SELECT val
         FROM waypoint_ratings
        WHERE waypoint_id = ?
          AND user_id = ?
          AND sync_status != 'deleted'`,
      [wid, uid]
    );
    user_rating = userRow?.val ?? null;
  }

  return { total, user_rating };
}

// POST Waypoint Rating (offline toggle)
// val ∈ {1, -1}
export async function setWaypointRatingOffline(
  waypointId: number,
  userId: number,
  val: 1 | -1
): Promise<RatingResult> {
  const wid = toInt(waypointId);
  const uid = toInt(userId);
  const ratingVal = toInt(val);

  if (!wid) throw new Error("Missing or invalid waypoint id");
  if (!uid) throw new Error("Missing or invalid user id");
  if (![1, -1].includes(ratingVal as number)) {
    throw new Error("val must be 1 or -1");
  }

  const existing = await dbGet<{ val: number; sync_status: string }>(
    `SELECT val, sync_status
       FROM waypoint_ratings
      WHERE waypoint_id = ? AND user_id = ?`,
    [wid, uid]
  );

  let user_rating: number | null = null;

  if (existing && existing.val === ratingVal) {
    // Same value → toggle OFF
    if (existing.sync_status === "new") {
      await dbRun(
        `DELETE FROM waypoint_ratings
          WHERE waypoint_id = ? AND user_id = ?`,
        [wid, uid]
      );
    } else {
      await dbRun(
        `UPDATE waypoint_ratings
            SET sync_status = 'deleted'
          WHERE waypoint_id = ? AND user_id = ?`,
        [wid, uid]
      );
    }
    user_rating = null;
  } else if (existing) {
    // Different value → update rating, mark dirty (unless still new)
    await dbRun(
      `UPDATE waypoint_ratings
          SET val = ?,
              sync_status = CASE
                              WHEN sync_status = 'new' THEN 'new'
                              ELSE 'dirty'
                            END
        WHERE waypoint_id = ? AND user_id = ?`,
      [ratingVal, wid, uid]
    );
    user_rating = ratingVal;
  } else {
    // No existing rating → insert new
    await dbRun(
      `INSERT INTO waypoint_ratings (user_id, waypoint_id, val, sync_status)
        VALUES (?, ?, ?, 'new')`,
      [uid, wid, ratingVal]
    );
    user_rating = ratingVal;
  }

  const totalRow = await dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(val), 0) AS total
       FROM waypoint_ratings
      WHERE waypoint_id = ?
        AND sync_status != 'deleted'`,
    [wid]
  );
  const total = totalRow?.total ?? 0;

  // keep aggregate in sync (ignore tombstones)
  await dbRun(`UPDATE waypoints SET rating = ? WHERE id = ?`, [total, wid]);

  return { total, user_rating };
}

/* ============================================
 * COMMENT RATINGS
 * ============================================
 */

export async function getCommentRatingOffline(
  commentId: number,
  userId?: number | null
): Promise<RatingResult> {
  const cid = toInt(commentId);
  const uid = userId != null ? toInt(userId) : null;

  if (!cid) throw new Error("Missing or invalid comment id");

  const totalRow = await dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(val), 0) AS total
       FROM comment_ratings
      WHERE comment_id = ?
        AND sync_status != 'deleted'`,
    [cid]
  );
  const total = totalRow?.total ?? 0;

  let user_rating: number | null = null;
  if (uid) {
    const userRow = await dbGet<{ val: number }>(
      `SELECT val
         FROM comment_ratings
        WHERE comment_id = ?
          AND user_id = ?
          AND sync_status != 'deleted'`,
      [cid, uid]
    );
    user_rating = userRow?.val ?? null;
  }

  return { total, user_rating };
}

export async function setCommentRatingOffline(
  commentId: number,
  userId: number,
  val: 1 | -1
): Promise<RatingResult> {
  const cid = toInt(commentId);
  const uid = toInt(userId);
  const ratingVal = toInt(val);

  if (!cid) throw new Error("Missing or invalid comment id");
  if (!uid) throw new Error("Missing or invalid user id");
  if (![1, -1].includes(ratingVal as number)) {
    throw new Error("val must be 1 or -1");
  }

  const existing = await dbGet<{ val: number; sync_status: string }>(
    `SELECT val, sync_status
       FROM comment_ratings
      WHERE comment_id = ? AND user_id = ?`,
    [cid, uid]
  );

  let user_rating: number | null = null;

  if (existing && existing.val === ratingVal) {
    // Toggle OFF
    if (existing.sync_status === "new") {
      await dbRun(
        `DELETE FROM comment_ratings
          WHERE comment_id = ? AND user_id = ?`,
        [cid, uid]
      );
    } else {
      await dbRun(
        `UPDATE comment_ratings
            SET sync_status = 'deleted'
          WHERE comment_id = ? AND user_id = ?`,
        [cid, uid]
      );
    }
    user_rating = null;
  } else if (existing) {
    // Change rating
    await dbRun(
      `UPDATE comment_ratings
          SET val = ?,
              sync_status = CASE
                              WHEN sync_status = 'new' THEN 'new'
                              ELSE 'dirty'
                            END
        WHERE comment_id = ? AND user_id = ?`,
      [ratingVal, cid, uid]
    );
    user_rating = ratingVal;
  } else {
    await dbRun(
      `INSERT INTO comment_ratings (user_id, comment_id, val, sync_status)
        VALUES (?, ?, ?, 'new')`,
      [uid, cid, ratingVal]
    );
    user_rating = ratingVal;
  }

  const totalRow = await dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(val), 0) AS total
       FROM comment_ratings
      WHERE comment_id = ?
        AND sync_status != 'deleted'`,
    [cid]
  );
  const total = totalRow?.total ?? 0;

  // keep aggregate on comments in sync
  await dbRun(`UPDATE comments SET rating = ? WHERE id = ?`, [total, cid]);

  return { total, user_rating };
}

/* ============================================
 * ROUTE RATINGS
 * ============================================
 */

export async function getRouteRatingOffline(
  routeId: number,
  userId?: number | null
): Promise<RatingResult> {
  const rid = toInt(routeId);
  const uid = userId != null ? toInt(userId) : null;

  if (!rid) throw new Error("Missing or invalid route id");

  const totalRow = await dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(val), 0) AS total
       FROM route_ratings
      WHERE route_id = ?
        AND sync_status != 'deleted'`,
    [rid]
  );
  const total = totalRow?.total ?? 0;

  let user_rating: number | null = null;
  if (uid) {
    const userRow = await dbGet<{ val: number }>(
      `SELECT val
         FROM route_ratings
        WHERE route_id = ?
          AND user_id = ?
          AND sync_status != 'deleted'`,
      [rid, uid]
    );
    user_rating = userRow?.val ?? null;
  }

  return { total, user_rating };
}

export async function setRouteRatingOffline(
  routeId: number,
  userId: number,
  val: 1 | -1
): Promise<RatingResult> {
  const rid = toInt(routeId);
  const uid = toInt(userId);
  const ratingVal = toInt(val);

  if (!rid) throw new Error("Missing or invalid route id");
  if (!uid) throw new Error("Missing or invalid user id");
  if (![1, -1].includes(ratingVal as number)) {
    throw new Error("val must be 1 or -1");
  }

  const existing = await dbGet<{ val: number; sync_status: string }>(
    `SELECT val, sync_status
       FROM route_ratings
      WHERE route_id = ? AND user_id = ?`,
    [rid, uid]
  );

  let user_rating: number | null = null;

  if (existing && existing.val === ratingVal) {
    // Toggle OFF
    if (existing.sync_status === "new") {
      await dbRun(
        `DELETE FROM route_ratings
          WHERE route_id = ? AND user_id = ?`,
        [rid, uid]
      );
    } else {
      await dbRun(
        `UPDATE route_ratings
            SET sync_status = 'deleted'
          WHERE route_id = ? AND user_id = ?`,
        [rid, uid]
      );
    }
    user_rating = null;
  } else if (existing) {
    // Change rating
    await dbRun(
      `UPDATE route_ratings
          SET val = ?,
              sync_status = CASE
                              WHEN sync_status = 'new' THEN 'new'
                              ELSE 'dirty'
                            END
        WHERE route_id = ? AND user_id = ?`,
      [ratingVal, rid, uid]
    );
    user_rating = ratingVal;
  } else {
    await dbRun(
      `INSERT INTO route_ratings (user_id, route_id, val, sync_status)
        VALUES (?, ?, ?, 'new')`,
      [uid, rid, ratingVal]
    );
    user_rating = ratingVal;
  }

  const totalRow = await dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(val), 0) AS total
       FROM route_ratings
      WHERE route_id = ?
        AND sync_status != 'deleted'`,
    [rid]
  );
  const total = totalRow?.total ?? 0;

  // keep aggregate on routes in sync
  await dbRun(`UPDATE routes SET rating = ? WHERE id = ?`, [total, rid]);

  return { total, user_rating };
}
