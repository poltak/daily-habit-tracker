-- Goals created before start dates existed begin on their first completion,
-- or on their creation date when they have never been completed.
UPDATE goals SET start_date = COALESCE((SELECT MIN(logical_date) FROM goal_completions WHERE goal_completions.goal_id = goals.id), substr(created_at, 1, 10)) WHERE start_date IS NULL;
