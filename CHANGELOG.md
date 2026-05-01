# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-01

Initial release. Extracted from production use in an AI video pipeline that needed to gate every cast/keyframe render to catch bad outputs (vampire fangs, mirrored scars, blue eyes on dark-eyed characters, T-pose with arms at sides, extreme-close-up rendering as medium shot).

### Added
- `gradeIdentity` — character-feature gate with multi-VLM consensus
- `gradeAnatomy` — anatomy gate with bias-calibrated open-ended questions
- `gradeFraming` — shot composition gate (intent vs observation)
- `scoreImageQuality` + `pickBestByQuality` — 10-aspect rubric scoring for tie-breaking
- Reliability matrix support for excluding biased `(model, question)` pairs
- Presets: `ORC_ANATOMY` and `HUMAN_ANATOMY`
- Examples: basic-identity, concept-passport-picker, retry-with-rejects
- Documentation: bias calibration deep-dive
