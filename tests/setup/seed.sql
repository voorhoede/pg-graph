CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    name TEXT
);

CREATE TABLE IF NOT EXISTS blog (
    id SERIAL PRIMARY KEY,
    name TEXT,
    posted_by INTEGER REFERENCES "user"(id)
);

CREATE TABLE IF NOT EXISTS comment (
    id SERIAL PRIMARY KEY,
    blog_id INTEGER REFERENCES blog(id),
    message TEXT,
    posted_by INTEGER REFERENCES "user"(id)
);

CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES "user"(id),
    last_visit TIMESTAMPTZ
);

BEGIN;
DELETE FROM "visits";
DELETE FROM comment;
DELETE FROM blog;
DELETE FROM "user";

INSERT INTO "user" (name) VALUES ('Remco');

INSERT INTO blog (name, posted_by) VALUES ('Blog about cats', currval('user_id_seq'));
INSERT INTO comment (blog_id, message, posted_by) VALUES (currval('blog_id_seq'), 'Amazing blog!', currval('user_id_seq'));
INSERT INTO comment (blog_id, message, posted_by) VALUES (currval('blog_id_seq'), 'I agree with this blog', currval('user_id_seq'));

INSERT INTO "user" (name) VALUES ('Harry');

INSERT INTO blog (name, posted_by) VALUES ('Blog about computers', currval('user_id_seq'));
INSERT INTO comment (blog_id, message, posted_by) VALUES (currval('blog_id_seq'), 'Amazing blog!', currval('user_id_seq'));
INSERT INTO comment (blog_id, message, posted_by) VALUES (currval('blog_id_seq'), 'I agree with this blog', currval('user_id_seq'));
INSERT INTO comment (blog_id, message, posted_by) VALUES (currval('blog_id_seq'), 'Very nerdy, i agree', currval('user_id_seq'));

INSERT INTO visits (id, user_id, last_visit) SELECT d.x as id, user_id, NOW() as last_visit FROM generate_series(0, 1000) as d(x)
	CROSS JOIN LATERAL (
		SELECT id as user_id FROM "user" WHERE 1000 <> d.x ORDER BY random() LIMIT 1
	) b
    ON CONFLICT (id) DO NOTHING;

COMMIT;