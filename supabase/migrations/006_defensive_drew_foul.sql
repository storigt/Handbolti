-- ─── Migration 006: Add drew_offensive_foul back to v_defensive_actions_by_player ─
-- Keep both rebound (Frákast) and drew_offensive_foul as separate columns.

drop view if exists v_defensive_actions_by_player;

create view v_defensive_actions_by_player as
select
  e.player_id, e.match_id, e.team_id,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='duel_won')       as duels_won,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION'
    and e.sub_type in ('duel_won','duel_lost'))                                             as duels_total,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='high_contact')   as high_contact,
  count(*) filter (where e.event_type='FOUL' and e.sub_type='attacking_foul')             as fouls_committed,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='interception')   as interceptions,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='block')          as blocks,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='rebound')        as rebounds,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='drew_offensive_foul') as drew_offensive_foul,
  count(*) filter (where e.event_type='FOUL' and e.sub_type='7m_awarded')                 as penalties_conceded,
  count(*) filter (where e.event_type='SUSPENSION' and e.sub_type='yellow_card')          as yellow_cards,
  count(*) filter (where e.event_type='SUSPENSION' and e.sub_type='2min')                 as suspensions_2min,
  count(*) filter (where e.event_type='SUSPENSION' and e.sub_type='red_card')             as red_cards,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='protest')        as protests
from events e
where e.player_id is not null
  and e.is_voided = false and e.is_edited = false
  and e.event_type in ('DEFENSIVE_ACTION', 'FOUL', 'SUSPENSION')
group by e.player_id, e.match_id, e.team_id;
