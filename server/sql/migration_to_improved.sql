-- Migration script to upgrade from original schema to improved schema
-- This script is safe to run on existing databases and maintains backward compatibility
-- Run this after backing up your database

-- Add missing constraints to existing tables
DO $$ BEGIN
  -- Organizations constraints
  BEGIN
    ALTER TABLE organizations ADD CONSTRAINT organizations_name_not_empty CHECK (LENGTH(TRIM(name)) > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE organizations ADD CONSTRAINT organizations_domain_format CHECK (domain IS NULL OR domain ~ '^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  -- Users constraints
  BEGIN
    ALTER TABLE users ADD CONSTRAINT users_username_not_empty CHECK (LENGTH(TRIM(username)) > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE users ADD CONSTRAINT users_email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE users ADD CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[1-9]\d{1,14}$');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  -- Organization users constraints
  BEGIN
    ALTER TABLE organization_users ADD CONSTRAINT organization_users_permissions_valid CHECK (jsonb_typeof(permissions) = 'object');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  -- Events constraints
  BEGIN
    ALTER TABLE events ADD CONSTRAINT events_name_not_empty CHECK (LENGTH(TRIM(name)) > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE events ADD CONSTRAINT events_date_future CHECK (event_date > created_at);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE events ADD CONSTRAINT events_available_not_exceed_total CHECK (available_slots <= total_slots);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE events ADD CONSTRAINT events_total_slots_limit CHECK (total_slots > 0 AND total_slots <= 10000);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  -- Bookings constraints
  BEGIN
    ALTER TABLE bookings ADD CONSTRAINT bookings_seats_limit CHECK (seats > 0 AND seats <= 50);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE bookings ADD CONSTRAINT bookings_waiting_number_only_when_waiting CHECK (
      (status = 'waiting' AND waiting_number IS NOT NULL) OR 
      (status != 'waiting' AND waiting_number IS NULL)
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  -- Booking seats constraints
  BEGIN
    ALTER TABLE booking_seats ADD CONSTRAINT booking_seats_seat_no_positive CHECK (seat_no > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE booking_seats ADD CONSTRAINT booking_seats_consistent_user CHECK (
      (booking_id IS NOT NULL AND user_id IS NOT NULL) OR 
      (booking_id IS NULL AND user_id IS NULL)
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  -- Booking history constraints
  BEGIN
    ALTER TABLE booking_history ADD CONSTRAINT booking_history_details_valid CHECK (jsonb_typeof(details) = 'object');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  -- Notifications constraints
  BEGIN
    ALTER TABLE notifications ADD CONSTRAINT notifications_message_not_empty CHECK (LENGTH(TRIM(message)) > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE notifications ADD CONSTRAINT notifications_sent_at_only_when_sent CHECK (
      (status IN ('sent', 'delivered') AND sent_at IS NOT NULL) OR 
      (status NOT IN ('sent', 'delivered') AND sent_at IS NULL)
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ BEGIN
  -- Organization invites constraints
  BEGIN
    ALTER TABLE organization_invites ADD CONSTRAINT organization_invites_email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE organization_invites ADD CONSTRAINT organization_invites_expires_future CHECK (expires_at > created_at);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE organization_invites ADD CONSTRAINT organization_invites_accepted_at_only_when_accepted CHECK (
      (status = 'accepted' AND accepted_at IS NOT NULL) OR 
      (status != 'accepted' AND accepted_at IS NULL)
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Add missing columns to existing tables
ALTER TABLE booking_seats ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS failed_reason TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_keycloak_org_id ON organizations(keycloak_org_id) WHERE keycloak_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_keycloak_id ON users(keycloak_id) WHERE keycloak_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_users_active ON organization_users(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_date_status ON events(event_date, status);

CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_waiting_number ON bookings(waiting_number) WHERE waiting_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);

CREATE INDEX IF NOT EXISTS idx_booking_seats_event_id ON booking_seats(event_id);
CREATE INDEX IF NOT EXISTS idx_booking_seats_booking_id ON booking_seats(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_seats_user_id ON booking_seats(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_seats_status ON booking_seats(status);
CREATE INDEX IF NOT EXISTS idx_booking_seats_seat_no ON booking_seats(seat_no);

CREATE INDEX IF NOT EXISTS idx_booking_history_booking_id ON booking_history(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_history_action ON booking_history(action);
CREATE INDEX IF NOT EXISTS idx_booking_history_created_at ON booking_history(created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_event_id ON notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_pending ON notifications(created_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_organization_invites_organization_id ON organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_invites_email ON organization_invites(email);
CREATE INDEX IF NOT EXISTS idx_organization_invites_token ON organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_organization_invites_status ON organization_invites(status);
CREATE INDEX IF NOT EXISTS idx_organization_invites_expires_at ON organization_invites(expires_at);

-- Add missing triggers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'update_booking_seats_updated_at' AND c.relname = 'booking_seats'
  ) THEN
    CREATE TRIGGER update_booking_seats_updated_at
    BEFORE UPDATE ON booking_seats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'update_notifications_updated_at' AND c.relname = 'notifications'
  ) THEN
    CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Create utility functions
CREATE OR REPLACE FUNCTION get_event_available_slots(event_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    total_slots INTEGER;
    booked_slots INTEGER;
BEGIN
    SELECT total_slots INTO total_slots FROM events WHERE id = event_uuid;
    SELECT COUNT(*) INTO booked_slots FROM booking_seats WHERE event_id = event_uuid AND status = 'booked';
    RETURN total_slots - booked_slots;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_event_available_slots()
RETURNS TRIGGER AS $$
BEGIN
    -- Update available_slots when booking_seats changes
    UPDATE events 
    SET available_slots = get_event_available_slots(NEW.event_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.event_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for automatic slot updates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'update_event_slots_on_booking_change' AND c.relname = 'booking_seats'
  ) THEN
    CREATE TRIGGER update_event_slots_on_booking_change
    AFTER INSERT OR UPDATE OR DELETE ON booking_seats
    FOR EACH ROW EXECUTE FUNCTION update_event_available_slots();
  END IF;
END $$;

-- Create views for common queries
CREATE OR REPLACE VIEW event_booking_summary AS
SELECT 
    e.id as event_id,
    e.name as event_name,
    e.org_id,
    e.event_date,
    e.total_slots,
    e.available_slots,
    COUNT(DISTINCT b.id) as total_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'confirmed' THEN b.id END) as confirmed_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'waiting' THEN b.id END) as waiting_bookings,
    COUNT(DISTINCT bs.id) as total_seats_booked
FROM events e
LEFT JOIN bookings b ON e.id = b.event_id
LEFT JOIN booking_seats bs ON e.id = bs.event_id AND bs.status = 'booked'
GROUP BY e.id, e.name, e.org_id, e.event_date, e.total_slots, e.available_slots;

CREATE OR REPLACE VIEW user_booking_summary AS
SELECT 
    u.id as user_id,
    u.username,
    u.email,
    COUNT(DISTINCT b.id) as total_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'confirmed' THEN b.id END) as confirmed_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'waiting' THEN b.id END) as waiting_bookings,
    COUNT(DISTINCT bs.id) as total_seats_booked
FROM users u
LEFT JOIN bookings b ON u.id = b.user_id
LEFT JOIN booking_seats bs ON u.id = bs.user_id AND bs.status = 'booked'
GROUP BY u.id, u.username, u.email;

-- Update existing data to ensure consistency
-- Fix any available_slots inconsistencies
UPDATE events 
SET available_slots = get_event_available_slots(id)
WHERE available_slots != get_event_available_slots(id);

-- Ensure all updated_at columns are set for existing records
UPDATE booking_seats SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE notifications SET updated_at = created_at WHERE updated_at IS NULL;

-- Migration completed successfully
SELECT 'Migration to improved schema completed successfully!' as status;
