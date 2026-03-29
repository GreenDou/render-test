import fs from 'node:fs/promises';
import path from 'node:path';
import wabtFactory from 'wabt';

const outDir = path.resolve('src/wasm');
const outFile = path.join(outDir, 'particle-update.wasm');

const wat = `(module
  (memory (export "memory") 32)
  (func (export "update")
    (param $ptr i32)
    (param $count i32)
    (param $dt f32)
    (param $width f32)
    (param $height f32)
    (local $i i32)
    (local $base i32)
    (local $x f32)
    (local $y f32)
    (local $vx f32)
    (local $vy f32)
    (local $dx f32)
    (local $dy f32)
    (local $dist2 f32)
    (local $invDist f32)
    (local $force f32)
    (local $cx f32)
    (local $cy f32)

    (local.set $cx (f32.mul (local.get $width) (f32.const 0.5)))
    (local.set $cy (f32.mul (local.get $height) (f32.const 0.5)))

    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $count)))

        (local.set $base
          (i32.add (local.get $ptr) (i32.mul (local.get $i) (i32.const 16)))
        )

        (local.set $x (f32.load (local.get $base)))
        (local.set $y (f32.load offset=4 (local.get $base)))
        (local.set $vx (f32.load offset=8 (local.get $base)))
        (local.set $vy (f32.load offset=12 (local.get $base)))

        (local.set $dx (f32.sub (local.get $cx) (local.get $x)))
        (local.set $dy (f32.sub (local.get $cy) (local.get $y)))
        (local.set $dist2
          (f32.add
            (f32.add
              (f32.mul (local.get $dx) (local.get $dx))
              (f32.mul (local.get $dy) (local.get $dy))
            )
            (f32.const 0.0001)
          )
        )
        (local.set $invDist
          (f32.div (f32.const 1.0) (f32.sqrt (local.get $dist2)))
        )
        (local.set $force
          (f32.min
            (f32.const 240.0)
            (f32.div (f32.const 12000.0) (local.get $dist2))
          )
        )

        (local.set $vx
          (f32.add
            (local.get $vx)
            (f32.mul
              (f32.add
                (f32.mul (f32.mul (local.get $dx) (local.get $invDist)) (local.get $force))
                (f32.mul (f32.neg (local.get $dy)) (f32.const 0.0018))
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
                (f32.mul (local.get $dx) (f32.const 0.0018))
              )
              (local.get $dt)
            )
          )
        )

        (local.set $vx (f32.mul (local.get $vx) (f32.const 0.999)))
        (local.set $vy (f32.mul (local.get $vy) (f32.const 0.999)))
        (local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) (local.get $dt))))
        (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) (local.get $dt))))

        (if (f32.lt (local.get $x) (f32.const 0.0))
          (then
            (local.set $x (f32.const 0.0))
            (local.set $vx (f32.mul (f32.abs (local.get $vx)) (f32.const 0.96)))
          )
        )
        (if (f32.gt (local.get $x) (local.get $width))
          (then
            (local.set $x (local.get $width))
            (local.set $vx (f32.mul (f32.neg (f32.abs (local.get $vx))) (f32.const 0.96)))
          )
        )
        (if (f32.lt (local.get $y) (f32.const 0.0))
          (then
            (local.set $y (f32.const 0.0))
            (local.set $vy (f32.mul (f32.abs (local.get $vy)) (f32.const 0.96)))
          )
        )
        (if (f32.gt (local.get $y) (local.get $height))
          (then
            (local.set $y (local.get $height))
            (local.set $vy (f32.mul (f32.neg (f32.abs (local.get $vy))) (f32.const 0.96)))
          )
        )

        (f32.store (local.get $base) (local.get $x))
        (f32.store offset=4 (local.get $base) (local.get $y))
        (f32.store offset=8 (local.get $base) (local.get $vx))
        (f32.store offset=12 (local.get $base) (local.get $vy))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
  )
)`;

const wabt = await wabtFactory();
const parsed = wabt.parseWat('particle-update.wat', wat);
const { buffer } = parsed.toBinary({ log: false, write_debug_names: true });

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(outFile, Buffer.from(buffer));
console.log(`Generated ${outFile}`);
