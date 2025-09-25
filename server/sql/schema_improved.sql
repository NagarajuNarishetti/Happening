-- Multi-Tenant Event Booking & Notification Platform Schema (Happening)
-- Improved version with better normalization, indexes, and constraints
-- Backward compatible with existing data

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Organizations (Tenants) - Improved with better constraints
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  keycloak_org_id VARCHAR(255) UNIQUE,
  settings JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Additional constraints
  CONSTRAINT organizations_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT organizations_domain_format CHECK (domain IS NULL OR domain ~ '^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
);

-- Users (can be orgAdmin, organizer, or user) - Improved with better validation
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keycloak_id VARCHAR(255) UNIQUE,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Additional constraints
  CONSTRAINT users_username_not_empty CHECK (LENGTH(TRIM(username)) > 0),
  CONSTRAINT users_email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[1-9]\d{1,14}$')
);

-- Organization Users - Improved with better constraints
CREATE TABLE IF NOT EXISTS organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('orgAdmin', 'organizer', 'user')),
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, user_id),
  -- Additional constraints
  CONSTRAINT organization_users_permissions_valid CHECK (jsonb_typeof(permissions) = 'object')
);

-- Events - Improved with better constraints and validation
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('webinar','concert','hackathon','conference','workshop','meetup','other')),
  event_date TIMESTAMP NOT NULL,
  total_slots INT NOT NULL CHECK (total_slots > 0 AND total_slots <= 10000),
  available_slots INT NOT NULL CHECK (available_slots >= 0),
  status TEXT CHECK (status IN ('upcoming','ongoing','completed','cancelled')) DEFAULT 'upcoming',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Additional constraints
  CONSTRAINT events_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT events_date_future CHECK (event_date > created_at),
  CONSTRAINT events_available_not_exceed_total CHECK (available_slots <= total_slots)
);

-- Backfill for existing deployments where columns may not exist yet
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS available_slots INT NOT NULL DEFAULT 0;
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'upcoming';
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Ensure constraints exist (Postgres skips duplicates safely when named)
DO $$ BEGIN
  BEGIN
    ALTER TABLE events
      ADD CONSTRAINT events_available_slots_nonnegative CHECK (available_slots >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Bookings - Improved with better constraints
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats INT NOT NULL CHECK (seats > 0 AND seats <= 50),
  status TEXT NOT NULL CHECK (status IN ('confirmed','waiting','cancelled')),
  waiting_number INT CHECK (waiting_number IS NULL OR waiting_number > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Additional constraints
  CONSTRAINT bookings_waiting_number_only_when_waiting CHECK (
    (status = 'waiting' AND waiting_number IS NOT NULL) OR 
    (status != 'waiting' AND waiting_number IS NULL)
  )
);

-- Per-seat allocation for events - Improved with better constraints
CREATE TABLE IF NOT EXISTS booking_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  seat_no INT NOT NULL CHECK (seat_no > 0),
  status TEXT NOT NULL CHECK (status IN ('booked','cancelled')) DEFAULT 'booked',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Additional constraints
  CONSTRAINT booking_seats_consistent_user CHECK (
    (booking_id IS NOT NULL AND user_id IS NOT NULL) OR 
    (booking_id IS NULL AND user_id IS NULL)
  )
);

-- Unique index to prevent double booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_seats_unique 
ON booking_seats(event_id, seat_no) 
WHERE status = 'booked';

-- Booking History - Improved with better constraints
CREATE TABLE IF NOT EXISTS booking_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created','cancelled','promoted','modified')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Additional constraints
  CONSTRAINT booking_history_details_valid CHECK (jsonb_typeof(details) = 'object')
);

-- Notifications - Improved with better constraints
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('booking_confirmed','booking_waitlisted','booking_cancelled','waitlist_promoted','event_updated','event_cancelled','event_reminder')),
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','failed','delivered')) DEFAULT 'pending',
  sent_at TIMESTAMP,
  failed_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Additional constraints
  CONSTRAINT notifications_message_not_empty CHECK (LENGTH(TRIM(message)) > 0),
  CONSTRAINT notifications_sent_at_only_when_sent CHECK (
    (status IN ('sent', 'delivered') AND sent_at IS NOT NULL) OR 
    (status NOT IN ('sent', 'delivered') AND sent_at IS NULL)
  )
);

-- Organization Invites - Improved with better constraints
CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('orgAdmin', 'organizer', 'user')),
  invited_by UUID NOT NULL REFERENCES users(id),
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Additional constraints
  CONSTRAINT organization_invites_email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT organization_invites_expires_future CHECK (expires_at > created_at),
  CONSTRAINT organization_invites_accepted_at_only_when_accepted CHECK (
    (status = 'accepted' AND accepted_at IS NOT NULL) OR 
    (status != 'accepted' AND accepted_at IS NULL)
  )
);

-- Enhanced Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_keycloak_org_id ON organizations(keycloak_org_id) WHERE keycloak_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_keycloak_id ON users(keycloak_id) WHERE keycloak_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_users_org_id ON organization_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_user_id ON organization_users(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_role ON organization_users(role);
CREATE INDEX IF NOT EXISTS idx_organization_users_active ON organization_users(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_events_org_id ON events(org_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_date_status ON events(event_date, status);

CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
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

-- Functions for automatic updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Make triggers idempotent using conditional blocks
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'update_organizations_updated_at' AND c.relname = 'organizations'
  ) THEN
    CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'update_users_updated_at' AND c.relname = 'users'
  ) THEN
    CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'update_organization_users_updated_at' AND c.relname = 'organization_users'
  ) THEN
    CREATE TRIGGER update_organization_users_updated_at
    BEFORE UPDATE ON organization_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'update_events_updated_at' AND c.relname = 'events'
  ) THEN
    CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'update_bookings_updated_at' AND c.relname = 'bookings'
  ) THEN
    CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'update_organization_invites_updated_at' AND c.relname = 'organization_invites'
  ) THEN
    CREATE TRIGGER update_organization_invites_updated_at
    BEFORE UPDATE ON organization_invites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Utility functions for common operations
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

-- Trigger to automatically update available_slots
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

-- Views for common queries
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
