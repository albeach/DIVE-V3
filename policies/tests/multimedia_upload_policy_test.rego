# Tests for Multimedia Upload Authorization Policy
#
# Validates file size and duration limits by classification.

package dive.authorization.multimedia_test

import rego.v1
import data.dive.authorization.multimedia

# ============================================
# File Size Limit Tests
# ============================================

test_unclassified_file_size_limit_500mb if {
    result := multimedia.max_upload_size_mb("UNCLASSIFIED")
    result == 500
}

test_confidential_file_size_limit_250mb if {
    result := multimedia.max_upload_size_mb("CONFIDENTIAL")
    result == 250
}

test_secret_file_size_limit_100mb if {
    result := multimedia.max_upload_size_mb("SECRET")
    result == 100
}

test_top_secret_file_size_limit_50mb if {
    result := multimedia.max_upload_size_mb("TOP_SECRET")
    result == 50
}

# ============================================
# Video Duration Limit Tests
# ============================================

test_unclassified_duration_limit_60min if {
    result := multimedia.max_video_duration_minutes("UNCLASSIFIED")
    result == 60
}

test_secret_duration_limit_30min if {
    result := multimedia.max_video_duration_minutes("SECRET")
    result == 30
}

test_top_secret_duration_limit_15min if {
    result := multimedia.max_video_duration_minutes("TOP_SECRET")
    result == 15
}

# ============================================
# MIME Type Detection Tests
# ============================================

test_is_audio_mp3 if {
    multimedia.is_audio("audio/mpeg")
}

test_is_audio_m4a if {
    multimedia.is_audio("audio/mp4")
}

test_is_audio_wav if {
    multimedia.is_audio("audio/wav")
}

test_is_video_mp4 if {
    multimedia.is_video("video/mp4")
}

test_is_video_webm if {
    multimedia.is_video("video/webm")
}

test_is_multimedia_audio if {
    multimedia.is_multimedia("audio/mpeg")
}

test_is_multimedia_video if {
    multimedia.is_multimedia("video/mp4")
}

# ============================================
# Upload Authorization Tests
# ============================================

test_allow_small_unclassified_video if {
    multimedia.allow_upload with input as {
        "action": "upload",
        "resource": {
            "mimeType": "video/mp4",
            "fileSize": 100 * 1024 * 1024,  # 100MB
            "classification": "UNCLASSIFIED",
            "duration": 1800  # 30 minutes
        }
    }
}

test_allow_secret_video_within_limits if {
    multimedia.allow_upload with input as {
        "action": "upload",
        "resource": {
            "mimeType": "video/mp4",
            "fileSize": 80 * 1024 * 1024,  # 80MB
            "classification": "SECRET",
            "duration": 1200  # 20 minutes
        }
    }
}

test_deny_oversized_secret_file if {
    not multimedia.allow_upload with input as {
        "action": "upload",
        "resource": {
            "mimeType": "video/mp4",
            "fileSize": 150 * 1024 * 1024,  # 150MB > 100MB limit
            "classification": "SECRET"
        }
    }
}

test_deny_overlong_top_secret_video if {
    not multimedia.allow_upload with input as {
        "action": "upload",
        "resource": {
            "mimeType": "video/mp4",
            "fileSize": 30 * 1024 * 1024,  # 30MB - within limit
            "classification": "TOP_SECRET",
            "duration": 1200  # 20 minutes > 15 minute limit
        }
    }
}

test_allow_audio_without_duration_check if {
    multimedia.allow_upload with input as {
        "action": "upload",
        "resource": {
            "mimeType": "audio/mpeg",
            "fileSize": 50 * 1024 * 1024,  # 50MB
            "classification": "SECRET",
            "duration": 7200  # 2 hours (no limit for audio)
        }
    }
}

# ============================================
# Violation Message Tests
# ============================================

test_violation_message_for_oversized_file if {
    violations := multimedia.violations with input as {
        "action": "upload",
        "resource": {
            "mimeType": "video/mp4",
            "fileSize": 150 * 1024 * 1024,  # 150MB
            "classification": "SECRET"
        }
    }
    count(violations) > 0
    some msg in violations
    contains(msg, "exceeds")
}

test_violation_message_for_overlong_video if {
    violations := multimedia.violations with input as {
        "action": "upload",
        "resource": {
            "mimeType": "video/mp4",
            "fileSize": 30 * 1024 * 1024,
            "classification": "TOP_SECRET",
            "duration": 1200  # 20 minutes
        }
    }
    count(violations) > 0
    some msg in violations
    contains(msg, "duration")
}

# ============================================
# Decision Output Tests
# ============================================

test_decision_includes_limits if {
    decision := multimedia.decision with input as {
        "action": "upload",
        "resource": {
            "mimeType": "video/mp4",
            "fileSize": 50 * 1024 * 1024,
            "classification": "SECRET"
        }
    }
    decision.limits.maxFileSizeMB == 100
    decision.limits.maxVideoDurationMinutes == 30
}

test_decision_includes_metadata if {
    decision := multimedia.decision with input as {
        "action": "upload",
        "resource": {
            "mimeType": "audio/mpeg",
            "fileSize": 50 * 1024 * 1024,
            "classification": "CONFIDENTIAL"
        }
    }
    decision.metadata.isAudio == true
    decision.metadata.isVideo == false
    decision.metadata.classification == "CONFIDENTIAL"
}
