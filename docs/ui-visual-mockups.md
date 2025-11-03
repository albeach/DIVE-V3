# DIVE V3 UI Visual Mockups

## Navigation Transformation: Before & After

### Current Navigation (Fragmented)
```
┌──────────────────────────────────────────────────────────────────────┐
│ DIVE V3  Dashboard Documents Upload Policies Compliance Lab    [User]│
│         (7 items causing decision fatigue)                           │
└──────────────────────────────────────────────────────────────────────┘
```

### New Navigation (Consolidated)
```
┌──────────────────────────────────────────────────────────────────────┐
│ ◆ DIVE V3   Dashboard  Resources▾  Policies▾  Standards▾ NEW  [👤▾] │
│                         │           │          │                      │
│                    ┌────┴────┐ ┌───┴────┐ ┌──┴─────────┐           │
│                    │ Browse   │ │ Active │ │ Journey Map │           │
│                    │ Upload   │ │ Lab    │ │ Attributes  │           │
│                    │ ZTDF/KAS │ │ Comply │ │ Simulator   │           │
│                    └──────────┘ └────────┘ └─────────────┘           │
└──────────────────────────────────────────────────────────────────────┘
```

## Standards Lens Landing Page

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                     [Federation|Unified|Object]
│  Standards Lens: ADatP-5663 × ACP-240                                │
│  ─────────────────────────────────────                               │
│  Visualizing dual-standard enforcement in coalition environments      │
│                                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │    5663     │  │ Shared ABAC │  │    240      │                  │
│  │ Federation  │  │   Common    │  │   Object    │                  │
│  │ & Identity  │  │   Logic     │  │  Security   │                  │
│  │ 🔵 Session  │  │ 🟢 Unified  │  │ 🟠 Data     │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ [Journey] [Attributes] [Matrix]                                  │ │
│  ├─────────────────────────────────────────────────────────────────┤ │
│  │                                                                   │ │
│  │  Federation Flow (ADatP-5663)                                    │ │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━                                   │ │
│  │  [User]──>[IdP]──>[Token]──>[PDP]──>[PEP]──>[Access]           │ │
│  │     ↓                          ↓                                 │ │
│  │     └──────────────────────────┴─────── ABAC Decision ─────┐    │ │
│  │                                                             ↓    │ │
│  │  Object Flow (ACP-240)                                      ↓    │ │
│  │  ━━━━━━━━━━━━━━━━━━━━                                      ↓    │ │
│  │  [Data]──>[Label]──>[PDP]──>[KAS]──>[Decrypt]──>[Audit]   ↓    │ │
│  │                        ↑                                    ↓    │ │
│  │                        └────────────────────────────────────┘    │ │
│  │                                                                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Dual-Layer Journey Map (Interactive)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Journey Map     [▶ Play] [⏸ Pause] [↻ Reset]    [Split|Overlay|Unified]
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ Federation Layer (ADatP-5663) ────────────────────────── 🔵          │
│                                                                       │
│   ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐              │
│   │ 👤  │───>│ 🏛️  │───>│ 🎫  │───>│ ⚖️  │───>│ 🚪  │              │
│   │User │    │ IdP │    │Token│    │ PDP │    │Access│              │
│   └─────┘    └─────┘    └─────┘    └──┬──┘    └─────┘              │
│                                        │                              │
│                                     🔀 │ ABAC                        │
│                                        │ Decision                     │
│                                        │                              │
│ Object Layer (ACP-240) ──────────────┬─────────────────── 🟠         │
│                                      │                                │
│   ┌─────┐    ┌─────┐    ┌─────┐    ┌──▼──┐    ┌─────┐              │
│   │ 📄  │───>│ 🏷️  │───>│ ⚖️  │───>│ 🔑  │───>│ 🔓  │              │
│   │Data │    │Label│    │ PDP │    │ KAS │    │Open │              │
│   └─────┘    └─────┘    └─────┘    └─────┘    └─────┘              │
│                                                                       │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ℹ️ Hover nodes for details • Click to expand • Drag to rearrange  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Attribute Diff Viewer

```
┌──────────────────────────────────────────────────────────────────────┐
│ Attribute Comparison                         🔍 Filter  [Side|Map|Unified]
├────────────────────────────────┬─────────────────────────────────────┤
│ ADatP-5663 (Identity Token) 🔵 │ ACP-240 (Object Label) 🟠          │
├────────────────────────────────┼─────────────────────────────────────┤
│ clearance: SECRET          ✅  │ classification: SECRET         ✅   │
│ ────────────────────────────>  │ <──────────────────────────────     │
│                                 │ ↕️ Direct mapping                    │
├────────────────────────────────┼─────────────────────────────────────┤
│ countryOfAffiliation: USA  ✅  │ releasabilityTo:              ✅   │
│                                 │ ["USA","GBR","CAN","AUS","NZL"]     │
│ ────────────────────────────>  │ <──────────────────────────────     │
│                                 │ ↗️ USA ∈ releasabilityTo[]          │
├────────────────────────────────┼─────────────────────────────────────┤
│ acpCOI: ["FVEY","NATO"]    ✅  │ COI: ["FVEY"]                 ✅   │
│ ────────────────────────────>  │ <──────────────────────────────     │
│                                 │ ∩ Intersection: ["FVEY"]            │
├────────────────────────────────┼─────────────────────────────────────┤
│ uniqueID: john.doe.mil     ❌  │ [no equivalent]               ➖   │
│ aal: AAL2                  ❌  │ [no equivalent]               ➖   │
├────────────────────────────────┼─────────────────────────────────────┤
│ [no equivalent]            ➖  │ creationDate: 2025-01-15      ❌   │
│ [no equivalent]            ➖  │ encryptionAlgorithm: AES256   ❌   │
├────────────────────────────────┴─────────────────────────────────────┤
│ Summary: ✅ 3 Shared  🔵 2 Federation Only  🟠 2 Object Only         │
└──────────────────────────────────────────────────────────────────────┘
```

## Split-Screen Object Lens

```
┌──────────────────────────────────────────────────────────────────────┐
│ Resource: fuel-inventory-doc-123.ztdf                                │
├─────────────────────────────────┬────────────────────────────────────┤
│ Session Context (5663) 🔵       │ Object Context (240) 🟠           │
├─────────────────────────────────┼────────────────────────────────────┤
│                                 │                                    │
│ ┌─────────────────────────────┐ │ ┌────────────────────────────────┐│
│ │ 🎫 Active Token             │ │ │ 🔒 Encrypted Resource          ││
│ │                             │ │ │                                ││
│ │ Subject: john.doe.mil       │ │ │ Classification: SECRET         ││
│ │ Clearance: SECRET           │ │ │ ReleaseTo: USA,GBR,CAN        ││
│ │ Country: USA                │ │ │ COI: FVEY                      ││
│ │ COI: [FVEY,NATO]           │ │ │ Encrypted: ✓                   ││
│ │ AAL: AAL2                   │ │ │ Size: 2.4MB                    ││
│ │                             │ │ │                                ││
│ │ Expires: 15 min             │ │ │ Created: 2025-01-15           ││
│ └─────────────────────────────┘ │ └────────────────────────────────┘│
│                                 │                                    │
│ ┌─────────────────────────────┐ │ ┌────────────────────────────────┐│
│ │ ⚖️ PDP Decision              │ │ │ 🔐 KAS Decision                ││
│ │                             │ │ │                                ││
│ │ ✅ Clearance Check: PASS    │ │ │ ⏳ Evaluating...              ││
│ │ ✅ Country Check: PASS      │ │ │                                ││
│ │ ✅ COI Check: PASS          │ │ │ ✅ Label Policy: PASS         ││
│ │                             │ │ │ ✅ Time Window: PASS          ││
│ │ Decision: PERMIT            │ │ │ ✅ Audit: LOGGED              ││
│ └─────────────────────────────┘ │ │                                ││
│                                 │ │ 🔑 Key Released                ││
│                 🔓              │ └────────────────────────────────┘│
│         [View Resource]         │         [Download Decrypted]       │
└─────────────────────────────────┴────────────────────────────────────┘
```

## Federation vs Object Matrix

```
┌──────────────────────────────────────────────────────────────────────┐
│ Standards Capability Matrix              [Filter: All|Common|Different]
├─────────────────────────┬──────────────────┬───────────────────────┤
│ Capability              │ ADatP-5663 🔵    │ ACP-240 🟠           │
├─────────────────────────┼──────────────────┼───────────────────────┤
│ Protocol                │ ✅ OIDC/OAuth    │ ➖ Ingests tokens     │
│ ├─ Details              │ Federation flows │ Not a protocol       │
│ └─ STANAG               │ 4778, 4774      │ N/A                  │
├─────────────────────────┼──────────────────┼───────────────────────┤
│ Encryption              │ ➖ N/A           │ ✅ ZTDF/KAS          │
│ ├─ Details              │ Transport only   │ Object encryption    │
│ └─ Algorithms           │ TLS 1.3         │ AES-256-GCM         │
├─────────────────────────┼──────────────────┼───────────────────────┤
│ Attributes              │ ✅ ABAC          │ ✅ ABAC              │
│ ├─ Subject              │ clearance, COI   │ via token            │
│ ├─ Resource             │ via PIP          │ classification, COI  │
│ └─ Decision             │ OPA/PDP          │ OPA/PDP              │
├─────────────────────────┼──────────────────┼───────────────────────┤
│ Audit                   │ ✅ Session logs  │ ✅ Object logs       │
│ ├─ Events               │ Login, logout    │ Encrypt, decrypt     │
│ └─ Retention            │ 90 days         │ 7 years              │
├─────────────────────────┴──────────────────┴───────────────────────┤
│ Legend: ✅ Full Support  ⚠️ Partial  ➖ Not Applicable              │
└──────────────────────────────────────────────────────────────────────┘
```

## Policy Replay Simulator

```
┌──────────────────────────────────────────────────────────────────────┐
│ Policy Decision Simulator                    [▶️ Start] [⏸] [↻ Reset] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ Step 1: User Authentication ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅         │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ john.doe.mil authenticated via us-idp with PIV + MFA (AAL2)     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ Step 2: Token Generation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅        │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ JWT Token:                                                       │ │
│ │ • clearance: SECRET                                              │ │
│ │ • countryOfAffiliation: USA                                      │ │
│ │ • acpCOI: ["FVEY", "NATO-COSMIC"]                              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ Step 3: Resource Request ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⏳         │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Requesting: fuel-inventory-doc-789.ztdf                         │ │
│ │ • classification: SECRET                                         │ │
│ │ • releasabilityTo: ["USA", "GBR", "CAN"]                       │ │
│ │ • COI: ["FVEY"]                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ Step 4: ABAC Evaluation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━           │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ⚖️ Evaluating OPA Policy...                                      │ │
│ │                                                                  │ │
│ │ ✓ Clearance: SECRET >= SECRET                                   │ │
│ │ ✓ Country: USA ∈ ["USA", "GBR", "CAN"]                        │ │
│ │ ✓ COI: ["FVEY"] ∩ ["FVEY", "NATO-COSMIC"] = ["FVEY"]          │ │
│ │                                                                  │ │
│ │ 🟢 Decision: PERMIT                                              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ [📊 View Rego] [📝 Export Trace] [🔄 Try Different Scenario]         │
└──────────────────────────────────────────────────────────────────────┘
```

## Mobile Navigation (Bottom Tab)

```
┌─────────────────┐
│                 │
│   Page Content  │
│                 │
│                 │
│                 │
├─────────────────┤
│  🏠  📂  📜  🔀  │  <- Fixed bottom navigation
│ Home Res Pol Std│  
└─────────────────┘

Expanded Menu (Slide Up):
┌─────────────────┐
│░░░░░░░░░░░░░░░░░│ <- Darkened background
│┌───────────────┐│
││   ⎯⎯⎯⎯⎯⎯⎯    ││ <- Drag handle
││               ││
││ Quick Actions ││
││ • Upload Doc  ││
││ • New Policy  ││
││ • View Audit  ││
││               ││
││ Settings      ││
││ • Profile     ││
││ • Sign Out    ││
│└───────────────┘│
└─────────────────┘
```

## Resources Hub Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Resources Hub                                           [Grid|List] 🔍│
├────────────────┬─────────────────────────────────────────────────────┤
│ Navigation     │ Browse Documents                                     │
│                │ ─────────────────                                    │
│ Browse         │                                                      │
│ ├ All Docs     │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ └ Search       │ │ SECRET  │ │ CONFID. │ │ UNCLASS │ │ SECRET  │   │
│                │ │ 📄 Fuel │ │ 📄 NATO │ │ 📄 Guide│ │ 🔐 Plan │   │
│ Manage         │ │ Report  │ │ Brief   │ │ v2.1    │ │ (ZTDF)  │   │
│ ├ Upload ●     │ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│ └ Bulk Ops     │                                                      │
│                │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ ZTDF/KAS       │ │ SECRET  │ │ TOP SEC │ │ SECRET  │ │ CONFID. │   │
│ ├ Encrypted    │ │ 📊 Stats│ │ 🔐 Intel│ │ 📑 Ops  │ │ 📈 Data │   │
│ ├ KAS Dash     │ │ 2025    │ │ (ZTDF)  │ │ Manual  │ │ Summary │   │
│ └ History      │ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                │                                                      │
│                │ Showing 1-8 of 247 documents    [1] 2 3 ... 31 →   │
└────────────────┴─────────────────────────────────────────────────────┘
```

## User Profile Dropdown (Enhanced)

```
┌────────────────────────────┐
│ 👤 John Doe (Pseudonym)     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ 🏷️ SECRET    🇺🇸 USA        │
│ 🔰 FVEY, NATO              │
│ ⏱️ Session: 12 min left     │
│ ─────────────────────────   │
│ 👁️ View Full Identity       │
│ 🔄 Switch IdP              │
│ 📊 My Activity             │
│ ─────────────────────────   │
│ 🛡️ Admin Portal            │
│ ├ 📈 Operations            │
│ ├ 👥 Identity & Access     │
│ ├ 📋 Governance            │
│ └ 🔌 Integration NEW       │
│ ─────────────────────────   │
│ 🚪 Sign Out                │
└────────────────────────────┘
```

These mockups demonstrate the visual transformation from a fragmented 7-item navigation to a consolidated 5-item structure with progressive disclosure. The Standards Lens becomes a primary feature, making the relationship between ADatP-5663 and ACP-240 visually intuitive through interactive components that tell the story of dual-standard enforcement.
