ALTER TABLE "buy_ins" ADD CONSTRAINT "buy_ins_amount_number_safe_ck"
  CHECK ("buy_ins"."amount" between -9007199254740991 and 9007199254740991);--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD CONSTRAINT "chip_ledger_delta_number_safe_ck"
  CHECK ("chip_ledger"."delta" between -9007199254740991 and 9007199254740991);--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_pot_number_safe_ck"
  CHECK ("rounds"."pot" <= 9007199254740991);--> statement-breakpoint

-- All public game/ranking views serialize chips as JavaScript numbers. User and room
-- absolute-activity budgets make every ranking subset and game-time aggregate
-- representable without lossy float8 casts. The locks cover writes to different rooms
-- for the same user and direct writes that bypass Server Action room locks.
CREATE OR REPLACE FUNCTION public.assert_user_chip_activity_number_safe()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  user_activity numeric;
  room_activity numeric;
  incoming_activity numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_id::text, 42));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 43));

  SELECT COALESCE(SUM(abs(delta::numeric)), 0)
    INTO user_activity
    FROM public.chip_ledger
    WHERE user_id = NEW.user_id;

  SELECT user_activity + COALESCE(SUM(abs(amount::numeric)), 0)
    INTO user_activity
    FROM public.buy_ins
    WHERE user_id = NEW.user_id;

  SELECT COALESCE(SUM(abs(delta::numeric)), 0)
    INTO room_activity
    FROM public.chip_ledger
    WHERE room_id = NEW.room_id;

  SELECT room_activity + COALESCE(SUM(abs(amount::numeric)), 0)
    INTO room_activity
    FROM public.buy_ins
    WHERE room_id = NEW.room_id;

  incoming_activity := abs(
    (
      to_jsonb(NEW) ->> CASE
        WHEN TG_TABLE_NAME = 'chip_ledger' THEN 'delta'
        WHEN TG_TABLE_NAME = 'buy_ins' THEN 'amount'
        ELSE NULL
      END
    )::numeric
  );

  IF user_activity + incoming_activity > 9007199254740991
     OR room_activity + incoming_activity > 9007199254740991 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'session chip activity exceeds the JavaScript safe integer range';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER buy_ins_number_safe_activity_trg
BEFORE INSERT ON public.buy_ins
FOR EACH ROW EXECUTE FUNCTION public.assert_user_chip_activity_number_safe();--> statement-breakpoint

CREATE TRIGGER chip_ledger_number_safe_activity_trg
BEFORE INSERT ON public.chip_ledger
FOR EACH ROW EXECUTE FUNCTION public.assert_user_chip_activity_number_safe();
