-- ----------------------------
-- Seed data for offline testing
-- ----------------------------

-- USER
INSERT INTO users (username, email, password_hash)
VALUES ('testuser', 'test@example.com', 'placeholder-hash');

-- ROUTE
INSERT INTO routes (user_id, slug, name, description, region, rating)
VALUES (
    1,
    'sample-route',
    'Sample Offline Test Route',
    'A test route for offline mode.',
    'Wisconsin',
    3
);

-- WAYPOINTS
INSERT INTO waypoints (route_id, user_id, name, description, lat, lon, type, rating)
VALUES
    (1, 1, 'Trailhead', 'Start of the trail', 43.0001, -89.0001, 'trailhead', 2),
    (1, 1, 'Scenic Overlook', 'A nice viewpoint', 43.0020, -89.0015, 'view', 5);

-- COMMENTS
INSERT INTO comments (user_id, kind, waypoint_id, route_id, content, rating, edited)
VALUES
    (1, 'waypoint', 1, NULL, 'Great start!', 1, 0),
    (1, 'route',    NULL, 1, 'Nice trail overall', 2, 0);

-- RATINGS
INSERT INTO waypoint_ratings (user_id, waypoint_id, val)
VALUES (1, 1, 1);

INSERT INTO route_ratings (user_id, route_id, val)
VALUES (1, 1, 1);

INSERT INTO comment_ratings (user_id, comment_id, val)
VALUES (1, 1, 1);

-- GPX FILE
-- (Geometry stored as GeoJSON, file stored as text blob)
INSERT INTO gpx (route_id, name, geometry, file)
VALUES (
    1,
    'Sample GPX Track',
    '{"type":"LineString","coordinates":[[-89.0001,43.0001],[-89.0005,43.0005]]}',
    '<gpx><trk><name>Sample</name><trkseg><trkpt lat="43.0001" lon="-89.0001"/><trkpt lat="43.0005" lon="-89.0005"/></trkseg></trk></gpx>'
);

-- SYNC STATE
INSERT INTO sync_state (key, value)
VALUES ('routes_last_pull', datetime('now'));
