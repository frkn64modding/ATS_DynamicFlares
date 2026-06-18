# Dynamic Flares

## Overview

This is an alternative standalone version of the Realistic Vehicle Lights mod.
It keeps the same overall lighting overhaul as the main version, but changes the flare behavior so nearby lamps look much cleaner and the flare effect becomes visible mainly at longer viewing distances.

This version is intended for players who dislike seeing obvious flare sprites when they are close to the light source.

## What This Version Changes

- Keeps the core light-definition work from the main mod.
- Strongly reduces close-range flare size across most vehicle light types.
- Increases flare growth with distance using very low `default_scale` and high `scale_factor`.
- Delays visible flare scaling by increasing `scaling_start_distance`.
- Extends flare growth range by increasing `scaling_end_distance`.
- Applies the same distant-flare idea to traffic-related flares and beacon flare scaling.

## Main Visual Goal

The target behavior is:

- Very little visible flare when close to headlights, indicators, markers, and other lamps.
- Flares becoming noticeable only at medium-to-far distance.
- A cleaner close-up look around vehicle lamps.
- Better long-range light readability without a heavy near-camera sprite effect.

## Key Technical Differences From the Main Version

### Distance Profiles

These files are the main behavior drivers:

- `unit/hookup/vehicle/flare/vehicle_lights_scaling_distance_beam.sui`
- `unit/hookup/vehicle/flare/vehicle_lights_scaling_distance_signal.sui`
- `unit/hookup/vehicle/flare/vehicle_lights_scaling_distance_marker.sui`
- `unit/hookup/tr_light_flares_scale.sui`

Compared with the main version, this variant:

- Starts scaling later
- Scales over a much longer distance range
- Uses much smaller base flare size

### Beam Family

Important files:

- `unit/hookup/vehicle/flare/vehicle_headl.sii`
- `unit/hookup/vehicle/flare/vehicle_high_beam.sii`
- `unit/hookup/vehicle/flare/vehicle_aux_lights*.sii`
- `unit/hookup/vehicle/flare/vehicle_aux_led.sii`
- `unit/hookup/vehicle/flare/vehicle_reversel*.sii`

These use very small near-source flare sizes so the light source itself stays visually cleaner up close.

### Signal Family

Important files:

- `unit/hookup/vehicle/flare/vehicle_brakel*.sii`
- `unit/hookup/vehicle/flare/vehicle_brake_ledl.sii`
- `unit/hookup/vehicle/flare/vehicle_lblinker*.sii`
- `unit/hookup/vehicle/flare/vehicle_rblinker*.sii`

Signals are tuned to stay compact nearby and become readable mainly at longer range.

### Marker Family

Important files:

- `unit/hookup/vehicle/flare/vehicle_rearl*.sii`
- `unit/hookup/vehicle/flare/vehicle_parkl.sii`
- `unit/hookup/vehicle/flare/vehicle_redl*.sii`
- `unit/hookup/vehicle/flare/vehicle_whitel*.sii`
- `unit/hookup/vehicle/flare/vehicle_orangel*.sii`
- `unit/hookup/vehicle/flare/vehicle_white_led*.sii`
- `unit/hookup/vehicle/flare/vehicle_orange_led*.sii`

Marker lights are especially restrained in this version so they do not look like floating discs near the camera.

### Beacon and Traffic Flares

Important files:

- `unit/hookup/vehicle/flare/vehicle_beacon.sii`
- `unit/hookup/vehicle/flare/vehicle_spot_beacon_scale_small.sui`
- `unit/hookup/vehicle/flare/vehicle_spot_beacon_scale_big.sui`
- `unit/hookup/tr_light_flares_scale.sui`

These were also converted to the distant-flare philosophy so beacon and traffic flares stay much smaller nearby.

## Tuning Philosophy

This version intentionally favors:

- Minimal close-up flare visibility
- Long-distance flare emergence
- Clean near-camera lamp presentation

It intentionally does not favor:

- Strong cinematic flare at short range
- Large visible sprites on nearby AI traffic
- Persistent glow-disc look around lamp housings

## Developer Notes

### Primary Control Parameters

This version depends heavily on:

- `default_scale`
- `scale_factor`
- `scaling_start_distance`
- `scaling_end_distance`

Interpretation:

- Very low `default_scale` keeps close flares nearly invisible.
- Very high `scale_factor` allows strong growth once distance increases.
- Higher `scaling_start_distance` delays the visual rise of the flare.
- Higher `scaling_end_distance` stretches the scaling effect farther out.

### If This Version Feels Too Weak

Adjust in this order:

1. Lower `scaling_start_distance`
2. Increase `default_scale` slightly
3. Reduce `scale_factor` only if long-distance growth becomes too abrupt

Best first file to test:

- `unit/hookup/vehicle/flare/vehicle_lights_scaling_distance_signal.sui`

### If This Version Still Shows Too Much Close Flare

Adjust in this order:

1. Lower `default_scale` further
2. Raise `scaling_start_distance`
3. Raise `scaling_end_distance` if the flare appears too early or too quickly

### Recommended Test Scenes

- Cabin view at night behind AI traffic
- Close-up free camera on parked trucks
- Rain at night with brake lights active
- Highway scenes with distant traffic
- Service vehicles with beacons
- Dark roads with high beams and aux lights

## Relationship to the Main Version

The root version of the mod is the balanced default build.
This `alternative/` version is the far-distance flare build.

Use the main version if you want visible but restrained flares at ordinary driving distances.
Use this alternative version if you want flare sprites to stay mostly hidden until the lamps are far away.
