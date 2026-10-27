struct Params { amount: f32, rate: f32 }

// The light steps to a new level `rate` times a second: mostly a wobble
// either side of as shot, one step in seven or so a drop nearly to black.
// Picked by `hash` from the step's number, so the same frame flickers the
// same way in the monitor and the export.
fn effect(uv: vec2<f32>) -> vec4<f32> {
    let c = sample(uv);
    let amount = params.amount / 100.0;
    let beat = floor(frame.time * params.rate);
    let wobble = hash(vec2<f32>(beat, 1.0), 0.5) - 0.5;
    let drop = step(0.85, hash(vec2<f32>(beat, 2.0), 0.5));
    let gain = max(1.0 + amount * (wobble * 0.5 - drop * 0.8), 0.05);
    return vec4<f32>(c.rgb * gain, c.a);
}
