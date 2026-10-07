import { Generated } from 'kysely';

export interface Database {
	profiles: ProfilesTable;
	calendars: CalendarsTable;
	events: EventsTable;
}

export interface ProfilesTable {
	id: string;
	display_name: string | Generated<string>;
	timezone: string | Generated<'UTC'>;
	week_start: 0 | 1 | 2 | 3 | 4 | 5 | 6 | Generated<0 | 1 | 2 | 3 | 4 | 5 | 6>;
	created_at: Generated<Date>;
	updated_at: Generated<Date>;
}

export interface CalendarsTable {
	id: string | Generated<string>;
	owner_id: string;
	name: string;
	color: string | null;
	kind:
		| 'personal'
		| 'suggested'
		| 'imported'
		| Generated<'personal' | 'suggested' | 'imported'>;
	is_default: boolean | Generated<boolean>;
	created_at: Generated<Date>;
	updated_at: Generated<Date>;
}

export interface EventsTable {
	// TODO: how do i add the check for either start_time not null or start_date
	id: string | Generated<string>;
	calendar_id: string;
	title: string;
	all_day: boolean | Generated<false>;
	start_time: Date | null;
	duration_minutes: number | null;
	start_date: Date | null;
	duration_days: number | null;
	timezone: string | Generated<'UTC'>;
	rrule: string | null;
	transparency: 'opaque' | 'transparent' | Generated<'opaque'>;
	status: 'confirmed' | 'tentative' | 'cancelled' | Generated<'confirmed'>;
	ical_uid: string | null;
	created_at: Generated<Date>;
	updated_at: Generated<Date>;
}
