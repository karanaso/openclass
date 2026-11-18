-- Add a unique 9-digit access code to every lesson.
ALTER TABLE "Lesson" ADD COLUMN "accessCode" TEXT;

-- The column is nullable during backfill; PostgreSQL allows multiple NULLs in
-- a unique index, so the constraint can be enforced while rows are filled in.
CREATE UNIQUE INDEX "Lesson_accessCode_key" ON "Lesson"("accessCode");

-- Backfill every existing lesson with a random 9-digit code, retrying when the
-- unique index reports a collision. 100000000-999999999 always has 9 digits.
DO $$
DECLARE
    lesson_row RECORD;
    candidate TEXT;
    attempts INTEGER;
BEGIN
    FOR lesson_row IN SELECT "id" FROM "Lesson" WHERE "accessCode" IS NULL LOOP
        attempts := 0;
        LOOP
            attempts := attempts + 1;
            candidate := (floor(random() * 900000000) + 100000000)::bigint::text;
            BEGIN
                UPDATE "Lesson" SET "accessCode" = candidate WHERE "id" = lesson_row."id";
                EXIT;
            EXCEPTION WHEN unique_violation THEN
                IF attempts >= 100 THEN
                    RAISE EXCEPTION 'Could not assign a unique access code to lesson %', lesson_row."id";
                END IF;
            END;
        END LOOP;
    END LOOP;
END $$;

ALTER TABLE "Lesson" ALTER COLUMN "accessCode" SET NOT NULL;
