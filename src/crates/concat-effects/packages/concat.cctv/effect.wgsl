struct Params { wear: f32, rec: f32 }

// A cheap sensor through worn tape: softened, grey with a cool cast, hard,
// every other line dimmed, noise, the corners falling off. The REC light
// sits in the top left, sized to the frame's height so it reads the same
// on a vertical cut, and is lit for the first half of every second.
fn effect(uv: vec2<f32>) -> vec4<f32> {
    let c = sample(uv);
    let wear = params.wear / 100.0;
    var out = mix(c.rgb, soften(uv, 1.5), 0.3 + wear * 0.4);
    out = mono(out, vec3<f32>(0.3, 0.59, 0.11)) * vec3<f32>(0.93, 1.0, 0.97);
    out = contrast(out, 1.1 + wear * 0.25);
    let row = fract(uv.y * frame.size.y / 4.0);
    out = out * (1.0 - wear * 0.15 * step(0.5, row));
    out = out + grain_at(uv, 0.03 + wear * 0.1);
    out = vignette(out, uv, 0.3 + wear * 0.4);
    let centre = vec2<f32>(0.07) * frame.size.y;
    let d = length(uv * frame.size - centre) / frame.size.y;
    let lit = (1.0 - step(0.5, fract(frame.time))) * step(0.5, params.rec);
    let dot = (1.0 - smoothstep(0.016, 0.02, d)) * lit;
    out = mix(out, vec3<f32>(0.92, 0.12, 0.1), dot);
    return vec4<f32>(out, c.a);
}
