# Planning Algorithm — v1

The user creates an activity and sets how many minutes they want to spend on it
each week. Caldochi suggests sessions in available calendar slots. The user can
accept, move, or resize sessions, then mark them done to track weekly progress.

There is no automatic learning in v1. Scheduling preferences change only when the
user explicitly updates them.

## User experience

1. Create an activity, such as **Reading**, with a goal of **120 minutes per week**.
2. Generate suggested sessions around existing calendar commitments.
3. Accept the suggestions, adjust them, or dismiss them.
4. After a session, mark it done. Its duration is the default number of minutes
   logged; the user can correct that number to reflect time actually spent.
5. See weekly progress, such as **Reading: 45 / 120 minutes**.

Scheduling a session reserves time. Marking it done advances progress.

## What the app stores

- **Activity:** name, weekly goal in minutes, and session defaults. Use a
  30-minute session duration initially; a preferred time is optional. The only
  required activity inputs are its name and weekly goal.
- **Plan block:** a proposed session, its activity, start time, duration, and
  status. Accepting it creates a calendar event and stores its ID on the block.
  The existing `plan_block.activity_id` and `plan_block.event_id` links identify
  which activity the scheduled session belongs to.
- **Calendar event:** the accepted session's current time and duration. Moves and
  resizes update the event.
- **Activity log:** the completed session, minutes spent, and when it took place.
  This records completion rather than acceptance or editing behavior.

Each session has at most one completion log. Correcting completion updates that
log; undoing completion removes its contribution to progress. Later calendar
edits do not silently rewrite previously logged minutes.

## Scheduling

Plan one calendar week using the user's timezone and configured week start.
Place suggestions only in the future, within the user's schedulable hours.
Expand recurring commitments and their exceptions before finding free time.

For each activity:

```text
minutes_to_suggest = max(
    0,
    weekly_goal_minutes
      - completed_minutes
      - upcoming_scheduled_minutes
      - outstanding_suggested_minutes
)
```

Count each session once: completed sessions contribute logged minutes, upcoming
accepted sessions contribute their current event duration, and outstanding
suggestions contribute proposed duration. Cancelled, dismissed, and past
uncompleted sessions reserve no minutes. Past suggestions expire.

Use a simple, deterministic placement rule:

1. Find free gaps around non-cancelled calendar occurrences that block time.
   Reserve space for outstanding suggestions too.
2. In a stable activity order, offer one session per activity per pass. Repeat
   until goals are covered or no further sessions fit.
3. Try the activity's preferred time first, if set; otherwise use the earliest
   available gap. Fall back to other free gaps when needed.
4. Use the activity's session duration, shortened when fewer minutes remain toward
   the goal. Require a gap that fits that session.
5. Reserve each new block's time and minutes before placing another.
6. If there is insufficient space, show the minutes left unscheduled.

Generating again accounts for existing blocks and events rather than duplicating
them. Acceptance rechecks availability and creates the event and its link
together; accepting twice must not create two events.

No weighted score, response score, or behavioral deltas are needed.

## Moving and resizing sessions

When the user changes a session's time or duration, ask:

> Just this session, or this and future sessions?

- **Just this session:** change only the selected session.
- **This and future sessions:** change this session and save the chosen time of
  day and/or duration as the activity's defaults. Apply those changes to future
  uncompleted sessions from this point onward and use them for new suggestions.

This follows the familiar scope of recurring-event edits. Surface conflicts if a
future change would overlap another commitment. Preserve completed history.
Moving a session to another day changes its date; saving a time preference does
not automatically create a weekday recurrence rule.

Changing session duration does not change the weekly goal. A session moved across
a week boundary counts toward its new week's scheduled total. Existing sessions
are not silently deleted when edits put the schedule above the weekly goal.

## Weekly progress

```text
completed_minutes = sum(minutes_spent logged for this activity in this week)
progress = completed_minutes / weekly_goal_minutes
```

Assign completed work to the week in which it took place, even if marked done
later. For v1, use the session's local start date to assign it to a week.
Weekly goals and session durations must be positive; logged minutes must be
nonnegative. The bar fills at 100%, but the total can show extra time, such as
**135 / 120 minutes**. Unfinished minutes do not automatically roll into next week.

## Example

Reading has a goal of 120 minutes per week and a session duration of 30 minutes.
With enough free time, the app suggests four sessions.

The user accepts them and moves one to the evening, choosing **Just this session**.
After completing two sessions, progress is **60 / 120 minutes**. The other two
upcoming sessions reserve the remaining 60 minutes, so generating again adds no
more reading sessions.

## Later versions

Automatic preference learning, acceptance statistics, frequency deltas, weighted
ranking, and adaptive recommendations are outside v1.
