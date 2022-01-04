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

BEGIN;
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

COMMIT;