DO $$
DECLARE
  poker_room record;
BEGIN
  FOR poker_room IN
    SELECT id, host_id
    FROM public.rooms
    WHERE game_type = 'poker'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.room_credit_locks
      WHERE room_id = poker_room.id
        AND released_transaction_id IS NULL
    ) THEN
      PERFORM public.settle_room_credits(poker_room.id, poker_room.host_id);
    END IF;
  END LOOP;
END;
$$;--> statement-breakpoint

ALTER TABLE public.credit_entries DISABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE public.credit_transactions DISABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE public.chip_ledger DISABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE public.round_fairness_reveals DISABLE TRIGGER USER;--> statement-breakpoint

DELETE FROM public.room_credit_locks
WHERE room_id IN (
  SELECT id FROM public.rooms WHERE game_type = 'poker'
);--> statement-breakpoint

DELETE FROM public.credit_entries
WHERE transaction_id IN (
  SELECT id
  FROM public.credit_transactions
  WHERE room_id IN (
    SELECT id FROM public.rooms WHERE game_type = 'poker'
  )
);--> statement-breakpoint

UPDATE public.credit_transactions
SET reverses_transaction_id = NULL
WHERE reverses_transaction_id IN (
  SELECT id
  FROM public.credit_transactions
  WHERE room_id IN (
    SELECT id FROM public.rooms WHERE game_type = 'poker'
  )
);--> statement-breakpoint

DELETE FROM public.credit_transactions
WHERE room_id IN (
  SELECT id FROM public.rooms WHERE game_type = 'poker'
);--> statement-breakpoint

DELETE FROM public.rooms
WHERE game_type = 'poker';--> statement-breakpoint

ALTER TABLE public.credit_entries ENABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE public.credit_transactions ENABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE public.chip_ledger ENABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE public.round_fairness_reveals ENABLE TRIGGER USER;--> statement-breakpoint

ALTER TABLE "public"."rooms" ALTER COLUMN "game_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."game_type";--> statement-breakpoint
CREATE TYPE "public"."game_type" AS ENUM('seotda', 'gostop');--> statement-breakpoint
ALTER TABLE "public"."rooms" ALTER COLUMN "game_type" SET DATA TYPE "public"."game_type" USING "game_type"::"public"."game_type";
