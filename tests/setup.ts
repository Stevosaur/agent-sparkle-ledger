// Integration tests run against a dedicated database, never the dev database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/pasarcatch_test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-000";
process.env.ANTHROPIC_API_KEY = "";
