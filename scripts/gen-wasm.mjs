import fs from 'node:fs/promises';
import path from 'node:path';
import wabtFactory from 'wabt';

const outDir = path.resolve('src/wasm');
const outFile = path.join(outDir, 'instance-update.wasm');

const wat = `(module
  (memory (export "memory") 64)
  (func (export "update")
    (param $ptr i32)
    (param $count i32)
    (param $dt f32)
    (param $time f32)
    (param $bounds f32)
    (local $i i32)
    (local $base i32)
    (local $x f32)
    (local $y f32)
    (local $z f32)
    (local $vx f32)
    (local $vy f32)
    (local $vz f32)
    (local $phase f32)
    (local $dx f32)
    (local $dy f32)
    (local $dz f32)
    (local $dist2 f32)
    (local $invDist f32)
    (local $force f32)

    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $base
          (i32.add (local.get $ptr) (i32.mul (local.get $i) (i32.const 32)))
        )

        (local.set $x (f32.load (local.get $base)))
        (local.set $y (f32.load offset=4 (local.get $base)))
        (local.set $z (f32.load offset=8 (local.get $base)))
        (local.set $vx (f32.load offset=12 (local.get $base)))
        (local.set $vy (f32.load offset=16 (local.get $base)))
        (local.set $vz (f32.load offset=20 (local.get $base)))
        (local.set $phase (f32.load offset=24 (local.get $base)))

        (local.set $dx (f32.neg (local.get $x)))
        (local.set $dy (f32.neg (local.get $y)))
        (local.set $dz (f32.neg (local.get $z)))
        (local.set $dist2
          (f32.add
            (f32.add
              (f32.add
                (f32.mul (local.get $dx) (local.get $dx))
                (f32.mul (local.get $dy) (local.get $dy))
              )
              (f32.mul (local.get $dz) (local.get $dz))
            )
            (f32.const 0.05)
          )
        )
        (local.set $invDist (f32.div (f32.const 1.0) (f32.sqrt (local.get $dist2))))
        (local.set $force (f32.min (f32.const 24.0) (f32.div (f32.const 18.0) (local.get $dist2))))

        (local.set $vx
          (f32.add
            (local.get $vx)
            (f32.mul
              (f32.add
                (f32.mul (f32.mul (local.get $dx) (local.get $invDist)) (local.get $force))
                (f32.mul (local.get $dz) (f32.const 0.35))
              )
              (local.get $dt)
            )
          )
        )
        (local.set $vy
          (f32.add
            (local.get $vy)
            (f32.mul
              (f32.add
                (f32.mul (f32.mul (local.get $dy) (local.get $invDist)) (local.get $force))
                (f32.mul (local.get $phase) (f32.const 0.15))
              )
              (local.get $dt)
            )
          )
        )
        (local.set $vz
          (f32.add
            (local.get $vz)
            (f32.mul
              (f32.add
                (f32.mul (f32.mul (local.get $dz) (local.get $invDist)) (local.get $force))
                (f32.mul (f32.neg (local.get $dx)) (f32.const 0.35))
              )
              (local.get $dt)
            )
          )
        )

        (local.set $vx (f32.mul (local.get $vx) (f32.const 0.992)))
        (local.set $vy (f32.mul (local.get $vy) (f32.const 0.992)))
        (local.set $vz (f32.mul (local.get $vz) (f32.const 0.992)))

        (local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) (local.get $dt))))
        (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) (local.get $dt))))
        (local.set $z (f32.add (local.get $z) (f32.mul (local.get $vz) (local.get $dt))))
        (local.set $phase (f32.add (local.get $phase) (f32.mul (local.get $dt) (f32.const 0.8))))

        (if (f32.gt (f32.abs (local.get $x)) (local.get $bounds))
          (then (local.set $vx (f32.neg (local.get $vx))))
        )
        (if (f32.gt (f32.abs (local.get $y)) (local.get $bounds))
          (then (local.set $vy (f32.neg (local.get $vy))))
        )
        (if (f32.gt (f32.abs (local.get $z)) (local.get $bounds))
          (then (local.set $vz (f32.neg (local.get $vz))))
        )

        (f32.store (local.get $base) (local.get $x))
        (f32.store offset=4 (local.get $base) (local.get $y))
        (f32.store offset=8 (local.get $base) (local.get $z))
        (f32.store offset=12 (local.get $base) (local.get $vx))
        (f32.store offset=16 (local.get $base) (local.get $vy))
        (f32.store offset=20 (local.get $base) (local.get $vz))
        (f32.store offset=24 (local.get $base) (local.get $phase))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
  )
)`;

const wabt = await wabtFactory();
const parsed = wabt.parseWat('instance-update.wat', wat);
const { buffer } = parsed.toBinary({ log: false, write_debug_names: true });

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(outFile, Buffer.from(buffer));
console.log(`Generated ${outFile}`);
