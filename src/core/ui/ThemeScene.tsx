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
  if (['arcade', 'miami', 'mixtape', 'memphis', 'disco', 'indian-ocean'].includes(preset))
    return <RetroArt preset={preset} />;
  if (preset === 'bridge') return <Bridge />;
  if (preset === 'dino') return <Park />;
  if (preset === 'wizard') return <Castle />;
  if (preset === 'terminal') return <Console />;
  if (preset === 'sparkle') return <Glitter />;
  if (['mars', 'moonlit', 'neon', 'synthwave'].includes(preset)) return <Horizon preset={preset} />;
  return <Stars preset={preset} />;
}

function RetroArt({ preset }: { preset: ThemePreset }) {
  const ink = 'var(--scene-ink, var(--accent))';
  const alt = 'var(--scene-alt, var(--section-purple))';
  const third = 'var(--section-green)';
  if (preset === 'mixtape')
    return (
      <g stroke={ink} strokeWidth="4">
        <rect x="260" y="18" width="280" height="130" rx="16" fill={alt} fillOpacity=".16" />
        <rect x="280" y="34" width="240" height="66" rx="8" />
        <circle cx="330" cy="67" r="23" stroke={alt} />
        <circle cx="470" cy="67" r="23" stroke={alt} />
        <path d="M354 67H446M310 146L325 116H475L490 146M365 46H435" />
        <path d="M40 54H230M80 78H230M120 102H230" stroke={third} strokeWidth="9" />
      </g>
    );
  if (preset === 'arcade')
    return (
      <g stroke={ink} strokeWidth="5" strokeLinejoin="round">
        <path d="M335 150V108L355 86V16H495V86L515 108V150ZM355 86H495M335 108H515" />
        <path d="M375 33H475V74H375Z" stroke={alt} />
        <path d="M378 121V137M370 129H386M460 129H467M480 129H487" stroke={third} />
        <path d="M210 40H225V55H240V70H225V85H210V70H195V55H210ZM95 110H110V125H125" stroke={alt} />
        <path className="scene-lights" d="M398 49H406V57H414V49H422M440 49H448V65H440" />
      </g>
    );
  if (preset === 'memphis')
    return (
      <g strokeWidth="7">
        <path d="M320 140L370 24L430 140ZM80 40L110 70L140 40L170 70L200 40" stroke={ink} />
        <circle cx="500" cy="52" r="32" stroke={alt} />
        <path d="M450 128L475 103L500 128L525 103L550 128M230 28V65M211 47H249" stroke={third} />
        <path d="M265 96L285 116M265 116L285 136M300 96L320 116" stroke={alt} />
      </g>
    );
  if (preset === 'disco')
    return (
      <g stroke={ink} strokeWidth="3">
        <path
          d="M420 0V18M330 40L295 22M510 40L545 22M325 100L285 115M515 100L555 115"
          stroke={alt}
        />
        <circle cx="420" cy="78" r="58" fill={alt} fillOpacity=".18" />
        <ellipse cx="420" cy="78" rx="25" ry="58" />
        <path d="M362 78H478M370 49H470M370 107H470M420 20V136" />
        <path
          className="scene-lights"
          d="M220 75V105M205 90H235M540 125V145M530 135H550"
          stroke={third}
        />
      </g>
    );
  return (
    <>
      <circle cx="420" cy="67" r="50" fill={ink} opacity=".75" />
      <path d="M370 54H470M370 66H470M370 78H470M380 90H460" stroke={alt} strokeWidth="4" />
      <path
        d="M130 120Q180 100 230 120T330 120T430 120T530 120T630 120M90 141Q140 121 190 141T290 141T390 141T490 141T590 141"
        stroke={third}
        strokeWidth="6"
      />
      {preset === 'indian-ocean' ? (
        <path d="M265 112L302 43V112ZM310 55L348 112H310ZM255 120H357L342 134H272Z" fill={alt} />
      ) : (
        <path
          d="M285 119L300 36M300 36Q270 10 240 34M300 36Q330 10 360 32M300 36Q270 38 258 66M300 36Q329 38 345 65"
          stroke={alt}
          strokeWidth="5"
        />
      )}
    </>
  );
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
