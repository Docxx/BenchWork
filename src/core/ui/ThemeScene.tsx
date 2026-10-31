import type { ThemePreset } from '../settings/appearance';

/** Small original vector scenes. Decoration stays outside the writing surface. */
export function ThemeScene({ preset }: { preset: ThemePreset }) {
  return (
    <svg
      className="theme-scene"
      data-scene={preset}
      viewBox="0 0 600 160"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <SceneArt preset={preset} />
    </svg>
  );
}

function SceneArt({ preset }: { preset: ThemePreset }) {
  if (preset === 'bridge') return <Bridge />;
  if (preset === 'dino') return <Park />;
  if (preset === 'wizard') return <Castle />;
  if (preset === 'terminal') return <Console />;
  if (preset === 'sparkle') return <Glitter />;
  if (['mars', 'moonlit', 'neon', 'synthwave'].includes(preset)) return <Horizon preset={preset} />;
  return <Stars preset={preset} />;
}

function Bridge() {
  return (
    <>
      <path
        d="M40 18H190Q220 18 220 48V100Q220 128 250 128H558"
        stroke="var(--scene-alt, #c6a2d5)"
        strokeWidth="22"
      />
      <path
        d="M40 54H180M40 88H180M40 122H180"
        stroke="var(--scene-ink, #ffae63)"
        strokeWidth="22"
      />
      <rect x="244" y="18" width="100" height="22" rx="11" fill="var(--scene-ink, #ffae63)" />
      <rect x="353" y="18" width="78" height="22" rx="11" fill="var(--scene-alt, #c6a2d5)" />
      <rect
        x="440"
        y="18"
        width="118"
        height="22"
        rx="11"
        fill="var(--scene-ink, #ffae63)"
        opacity=".6"
      />
      <g stroke="var(--scene-alt, #c6a2d5)" opacity=".5">
        <path d="M250 63H556M250 81H556M250 99H556M300 52V105M370 52V105M440 52V105M510 52V105" />
      </g>
      <path
        className="scene-signal"
        d="M252 88H290L301 66L318 96L337 76H366L380 62L392 87H427L443 71L460 93L476 78H551"
        stroke="var(--scene-ink, #ffae63)"
        strokeWidth="3"
      />
      <g className="scene-lights" fill="var(--scene-ink, #ffae63)">
        <circle cx="265" cy="147" r="3" />
        <circle cx="280" cy="147" r="3" />
        <circle cx="295" cy="147" r="3" />
      </g>
      <path d="M320 147H558" stroke="var(--scene-alt, #c6a2d5)" strokeWidth="3" opacity=".45" />
    </>
  );
}

function Park() {
  return (
    <>
      <circle cx="378" cy="67" r="53" fill="var(--scene-ink, #e8b64b)" opacity=".12" />
      <circle
        cx="378"
        cy="67"
        r="43"
        stroke="var(--scene-ink, #e8b64b)"
        strokeWidth="2"
        opacity=".65"
      />
      <path
        d="M350 101Q353 84 363 75L367 52Q378 39 396 44L412 53V63L388 62L384 70L405 72L402 80L380 77L370 103Z"
        fill="var(--scene-ink, #e8b64b)"
        opacity=".5"
      />
      <path
        d="M271 149V49L288 37H306V149M449 149V37H467L484 49V149M302 51Q377 -1 450 51M312 59Q377 16 440 59"
        stroke="var(--scene-ink, #e8b64b)"
        strokeWidth="5"
      />
      <path
        d="M314 149V65H439V149M377 65V148M326 76V146M341 76V146M357 76V146M394 76V146M410 76V146M426 76V146"
        stroke="var(--scene-alt, #719e6b)"
        strokeWidth="2"
      />
      <path
        d="M30 152Q80 84 158 122Q204 134 242 150M464 149Q530 95 596 133"
        stroke="var(--scene-alt, #719e6b)"
        strokeWidth="16"
        opacity=".35"
      />
      <g stroke="var(--scene-alt, #719e6b)" strokeWidth="3" strokeLinecap="round">
        <path d="M122 150L141 46M141 46Q105 24 63 48M141 46Q174 12 218 30M141 46Q102 57 86 87M141 46Q182 43 205 76" />
        <path d="M552 155L532 66M532 66Q500 36 468 55M532 66Q560 35 593 48M532 66Q567 71 582 100" />
      </g>
      <path d="M378 47L387 63H369Z" fill="var(--scene-ink, #e8b64b)" className="scene-lights" />
      <path d="M30 155H594" stroke="var(--scene-ink, #e8b64b)" opacity=".5" />
    </>
  );
}

function Console() {
  return (
    <g stroke="var(--scene-ink, currentColor)" strokeWidth="2">
      <path d="M184 29H551V136H184ZM184 48H551M199 38H204M211 38H216M223 38H228" opacity=".45" />
      <path d="M205 66L216 76L205 86M231 85H288M205 101H332M205 116H265M351 116H524" />
      <path d="M414 61V108M391 85H437" opacity=".25" />
      <path className="scene-lights" d="M344 85H362" strokeWidth="7" />
    </g>
  );
}

function Glitter() {
  return (
    <g fill="var(--scene-ink, currentColor)" className="scene-lights">
      {[
        [140, 80, 18],
        [238, 35, 10],
        [308, 114, 14],
        [388, 64, 28],
        [486, 112, 12],
        [548, 38, 16],
      ].map(([x = 0, y = 0, r = 0]) => (
        <path
          key={x}
          transform={`translate(${String(x)} ${String(y)}) scale(${String(r / 18)})`}
          d="M0 -18Q3 -3 18 0Q3 3 0 18Q-3 3 -18 0Q-3 -3 0 -18Z"
          opacity=".5"
        />
      ))}
    </g>
  );
}

function Horizon({ preset }: { preset: ThemePreset }) {
  return (
    <g stroke="var(--scene-ink, currentColor)" strokeWidth="2">
      <circle
        cx="419"
        cy="65"
        r="42"
        opacity=".3"
        fill="var(--scene-ink, currentColor)"
        fillOpacity=".12"
      />
      {preset === 'neon' ? (
        <path
          d="M111 147V97H145V68H171V147M187 147V44H231V147M247 147V84H286V147M304 147V60H329V147M343 147V105H375V147M467 147V96H510V147M524 147V56H561V147M198 62H218M198 80H218M198 98H218"
          opacity=".6"
        />
      ) : preset === 'moonlit' ? (
        <path
          d="M160 147V55M160 55L139 92H181L131 116H189M222 147V80M222 80L203 110H241L198 133H246M520 147V35M520 35L496 80H544L486 111H554L480 138H560"
          opacity=".45"
        />
      ) : preset === 'synthwave' ? (
        <path
          d="M105 148H590M139 128H571M179 112H549M233 99H519M300 87H479M344 80H453M180 148L378 80M310 148L397 80M440 148L416 80M570 148L435 80M383 40H455M378 53H460M377 66H461"
          opacity=".5"
        />
      ) : (
        <path
          d="M90 149Q180 66 260 118T414 127T590 110M210 149Q290 114 368 143M111 149H590"
          opacity=".6"
        />
      )}
      <circle
        className="scene-lights"
        cx="543"
        cy="23"
        r="2"
        fill="var(--scene-ink, currentColor)"
      />
    </g>
  );
}

function Castle() {
  return (
    <>
      <path
        d="M467 9A23 23 0 1 0 490 40A26 26 0 0 1 467 9Z"
        fill="var(--scene-ink, #a67828)"
        opacity=".55"
      />
      <path
        d="M253 149V88H279V58L293 26L307 58V88H337V66L352 47L367 66V98H394V47L411 9L428 47V98H452V68L466 46L480 68V149Z"
        fill="var(--scene-ink, #a67828)"
        opacity=".18"
      />
      <path
        d="M253 149V88H279V58L293 26L307 58V88H337V66L352 47L367 66V98H394V47L411 9L428 47V98H452V68L466 46L480 68V149M247 149H492"
        stroke="var(--scene-ink, #a67828)"
        strokeWidth="2"
      />
      <path
        d="M291 71V79M350 78V86M408 59V68M420 84V92M465 80V88M296 109V118M343 112V122M401 114V125M430 113V122"
        stroke="var(--scene-alt, #c79c45)"
        strokeWidth="3"
        className="scene-lights"
      />
      <g className="scene-float" stroke="var(--scene-ink, #a67828)" strokeWidth="2">
        <path d="M103 91V116H111V91ZM157 50V79H165V50ZM201 90V112H209V90Z" />
        <path
          d="M107 86Q101 80 107 73Q113 80 107 86M161 45Q155 39 161 32Q167 39 161 45M205 85Q199 79 205 72Q211 79 205 85"
          fill="var(--scene-alt, #c79c45)"
        />
      </g>
      <g stroke="var(--scene-ink, #a67828)" opacity=".5">
        <path d="M230 22V32M225 27H235M516 57V67M511 62H521M337 16V22M334 19H340M67 38V46M63 42H71" />
      </g>
    </>
  );
}

function Stars({ preset }: { preset: ThemePreset }) {
  const sonar = preset === 'deep' || preset === 'xeno';
  return (
    <>
      <g stroke="var(--scene-ink, currentColor)" opacity=".3">
        {sonar ? (
          <>
            <circle cx="400" cy="80" r="65" />
            <circle cx="400" cy="80" r="43" />
            <circle cx="400" cy="80" r="21" />
            <path d="M322 80H478M400 3V157" />
          </>
        ) : (
          <>
            <circle cx="412" cy="80" r="52" />
            <ellipse cx="412" cy="80" rx="95" ry="24" transform="rotate(-22 412 80)" />
            <path d="M84 131L166 93L238 112L294 53M166 93L182 36" />
          </>
        )}
      </g>
      <g fill="var(--scene-ink, currentColor)" className="scene-lights">
        <circle cx="84" cy="131" r="3" />
        <circle cx="166" cy="93" r="4" />
        <circle cx="238" cy="112" r="3" />
        <circle cx="294" cy="53" r="3" />
        <circle cx="182" cy="36" r="2" />
        <circle cx="518" cy="31" r="3" />
        <circle cx="555" cy="124" r="2" />
      </g>
      <path
        className="scene-signal"
        d="M340 80L400 80L446 34"
        stroke="var(--scene-ink, currentColor)"
        strokeWidth="2"
        opacity={sonar ? '.7' : '0'}
      />
    </>
  );
}
