fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let a = vec2<f32>(frame.size.x / frame.size.y, 1.0);
    let p = uv * a * 5.0;
    let cell = floor(p);
    var best = 9.0;
    var id = vec2<f32>(0.0);
    for (var y: i32 = -1; y <= 1; y++) {
        for (var x: i32 = -1; x <= 1; x++) {
            let n = cell + vec2<f32>(f32(x), f32(y));
            let pt = n + vec2<f32>(hash(n, 1.0), hash(n, 2.0));
            let dd = length(pt - p);
            if (dd < best) {
                best = dd;
                id = n;
            }
        }
    }
    let start = hash(id, 3.0) * 0.6;
    let fall = clamp((progress - start) / 0.4, 0.0, 1.0);
    let q = uv - vec2<f32>(0.0, fall * fall * 0.6);
    let gone = fall >= 1.0 || q.y < 0.0;
    return select(from_at(q), to_at(uv), gone || fall > 0.0 && hash(id, 4.0) < fall * fall);
}
