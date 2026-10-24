import { Generated } from 'kysely';

export interface Database {
	profiles: ProfilesTable;
	calendars: CalendarsTable;
	events: EventsTable;
}

export interface ProfilesTable {
	id: string;
	display_name: Generated<string>;
	timezone: Generated<string>;
	week_start: Generated<0 | 1 | 2 | 3 | 4 | 5 | 6>;
	created_at: Generated<Date>;
	updated_at: Generated<Date>;
}

export interface CalendarsTable {
	id: Generated<string>;
	owner_id: string;
	name: string;
	color: string | null;
	kind: Generated<'personal' | 'suggested' | 'imported'>;
	is_default: Generated<boolean>;
	created_at: Generated<Date>;
	updated_at: Generated<Date>;
}

export interface EventsTable {
	// TODO: how do i add the check for either start_time not null or start_date
	id: Generated<string>;
	calendar_id: string;
	title: string;
	all_day: Generated<boolean>;
	start_time: Date | null;
	duration_minutes: number | null;
	start_date: string | null;
	duration_days: number | null;
	timezone: Generated<string>;
	rrule: string | null;
	transparency: Generated<'opaque' | 'transparent'>;
	status: Generated<'confirmed' | 'tentative' | 'cancelled'>;
	// Format YYYY-MM-DD
	ical_uid: string | null;
	created_at: Generated<Date>;
	updated_at: Generated<Date>;
}
