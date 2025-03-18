/*
  # Add date confirmation feature

  1. Changes
    - Create work_order_dates table if it doesn't exist
    - Add confirmed column to track date confirmations
    - Create trigger to track date and confirmation changes
    - Add proper constraints and relationships

  2. Security
    - Enable RLS on work_order_dates table
    - Add policies for authenticated users
*/

-- Create work_order_dates table if it doesn't exist
CREATE TABLE IF NOT EXISTS work_order_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage text NOT NULL,
  date date,
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE(work_order_id, stage)
);

-- Enable RLS
ALTER TABLE work_order_dates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can read work order dates"
  ON work_order_dates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert work order dates"
  ON work_order_dates
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update work order dates"
  ON work_order_dates
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = updated_by);

-- Create trigger function to track changes
CREATE OR REPLACE FUNCTION record_work_order_date_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Record date changes
  IF (TG_OP = 'UPDATE' AND OLD.date IS DISTINCT FROM NEW.date) OR
     (TG_OP = 'INSERT' AND NEW.date IS NOT NULL) THEN
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

  -- Record confirmation changes
  IF (TG_OP = 'UPDATE' AND OLD.confirmed IS DISTINCT FROM NEW.confirmed) OR
     (TG_OP = 'INSERT' AND NEW.confirmed IS TRUE) THEN
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER record_work_order_date_change_trigger
  AFTER INSERT OR UPDATE ON work_order_dates
  FOR EACH ROW
  EXECUTE FUNCTION record_work_order_date_change();