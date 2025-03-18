/*
  # Add date confirmation feature

  1. Changes
    - Add confirmed column to work_order_dates table
    - Update trigger to track confirmation changes
    - Add default value of false for confirmed column

  2. Security
    - Maintain existing RLS policies
    - Track confirmation changes in history
*/

-- Add confirmed column
ALTER TABLE work_order_dates 
ADD COLUMN confirmed boolean NOT NULL DEFAULT false;

-- Update trigger function to track confirmation changes
CREATE OR REPLACE FUNCTION record_work_order_date_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Record date changes
  IF (TG_OP = 'UPDATE' AND (OLD.date IS DISTINCT FROM NEW.date OR OLD.confirmed IS DISTINCT FROM NEW.confirmed)) OR
     (TG_OP = 'INSERT' AND (NEW.date IS NOT NULL OR NEW.confirmed IS TRUE)) THEN
    
    -- Record date change
    IF OLD.date IS DISTINCT FROM NEW.date THEN
      INSERT INTO work_order_history (
        work_order_id,
        field,
        old_value,
        new_value,
        changed_by
      ) VALUES (
        NEW.work_order_id,
        NEW.stage || ' - Fecha',
        CASE 
          WHEN TG_OP = 'UPDATE' THEN 
            COALESCE(to_char(OLD.date, 'YYYY-MM-DD'), '')
          ELSE 
            ''
        END,
        COALESCE(to_char(NEW.date, 'YYYY-MM-DD'), ''),
        COALESCE(NEW.updated_by, NEW.created_by)
      );
    END IF;

    -- Record confirmation change
    IF OLD.confirmed IS DISTINCT FROM NEW.confirmed THEN
      INSERT INTO work_order_history (
        work_order_id,
        field,
        old_value,
        new_value,
        changed_by
      ) VALUES (
        NEW.work_order_id,
        NEW.stage || ' - Confirmación',
        CASE 
          WHEN TG_OP = 'UPDATE' THEN 
            CASE WHEN OLD.confirmed THEN 'Confirmada' ELSE 'No confirmada' END
          ELSE 
            'No confirmada'
        END,
        CASE WHEN NEW.confirmed THEN 'Confirmada' ELSE 'No confirmada' END,
        COALESCE(NEW.updated_by, NEW.created_by)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;