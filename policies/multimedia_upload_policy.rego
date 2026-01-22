# STANAG 4774/4778 Multimedia Upload Authorization Policy
#
# Enforces file size and duration limits based on classification level
# for audio and video uploads.
#
# Reference: docs/TDR-AUDIO-VIDEO-BINDING.md
# Reference: ACP-240 Data-Centric Security

package dive.authorization.multimedia

import rego.v1

# Default deny
default allow_upload := false

# ============================================
# File Size Limits by Classification (MB)
# ============================================

# Maximum file size for multimedia uploads based on classification
max_upload_size_mb(classification) := size if {
    sizes := {
        "UNCLASSIFIED": 500,
        "RESTRICTED": 300,
        "CONFIDENTIAL": 250,
        "SECRET": 100,
        "TOP_SECRET": 50,
    }
    size := sizes[upper(classification)]
}

# Fallback for unknown classification
max_upload_size_mb(classification) := 50 if {
    not upper(classification) in {"UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"}
}

# ============================================
# Video Duration Limits by Classification (Minutes)
# ============================================

# Maximum video duration based on classification
max_video_duration_minutes(classification) := duration if {
    durations := {
        "UNCLASSIFIED": 60,
        "RESTRICTED": 45,
        "CONFIDENTIAL": 45,
        "SECRET": 30,
        "TOP_SECRET": 15,
    }
    duration := durations[upper(classification)]
}

# Fallback for unknown classification
max_video_duration_minutes(classification) := 15 if {
    not upper(classification) in {"UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"}
}

# ============================================
# MIME Type Validation
# ============================================

# Allowed audio MIME types
allowed_audio_types := {
    "audio/mpeg",    # MP3
    "audio/mp4",     # M4A
    "audio/wav",     # WAV
    "audio/x-wav",   # WAV alternative
    "audio/webm",    # WebM audio
    "audio/ogg",     # OGG Vorbis
}

# Allowed video MIME types
allowed_video_types := {
    "video/mp4",     # MP4
    "video/webm",    # WebM video
    "video/ogg",     # OGG Theora
}

# Check if MIME type is audio
is_audio(mime_type) if {
    mime_type in allowed_audio_types
}

is_audio(mime_type) if {
    startswith(mime_type, "audio/")
}

# Check if MIME type is video
is_video(mime_type) if {
    mime_type in allowed_video_types
}

is_video(mime_type) if {
    startswith(mime_type, "video/")
}

# Check if MIME type is multimedia
is_multimedia(mime_type) if {
    is_audio(mime_type)
}

is_multimedia(mime_type) if {
    is_video(mime_type)
}

# ============================================
# Upload Authorization Rules
# ============================================

# Allow multimedia upload if all conditions are met
allow_upload if {
    # Input must have required fields
    input.action == "upload"
    input.resource.mimeType
    input.resource.fileSize
    input.resource.classification

    # MIME type must be valid multimedia
    is_multimedia(input.resource.mimeType)

    # File size must be within limits
    file_size_mb := input.resource.fileSize / (1024 * 1024)
    max_size := max_upload_size_mb(input.resource.classification)
    file_size_mb <= max_size

    # Video duration check (if applicable and provided)
    video_duration_ok
}

# Video duration is OK if:
# - Not a video, OR
# - Duration not provided, OR
# - Duration within limits
video_duration_ok if {
    not is_video(input.resource.mimeType)
}

video_duration_ok if {
    is_video(input.resource.mimeType)
    not input.resource.duration
}

video_duration_ok if {
    is_video(input.resource.mimeType)
    input.resource.duration
    duration_minutes := input.resource.duration / 60
    max_duration := max_video_duration_minutes(input.resource.classification)
    duration_minutes <= max_duration
}

# ============================================
# Violation Messages
# ============================================

# Collect all violations for detailed error reporting
violations contains msg if {
    input.action == "upload"
    is_multimedia(input.resource.mimeType)
    file_size_mb := input.resource.fileSize / (1024 * 1024)
    max_size := max_upload_size_mb(input.resource.classification)
    file_size_mb > max_size
    msg := sprintf("File size %.1fMB exceeds maximum %dMB for %s classification", [file_size_mb, max_size, input.resource.classification])
}

violations contains msg if {
    input.action == "upload"
    is_video(input.resource.mimeType)
    input.resource.duration
    duration_minutes := input.resource.duration / 60
    max_duration := max_video_duration_minutes(input.resource.classification)
    duration_minutes > max_duration
    msg := sprintf("Video duration %.1f minutes exceeds maximum %d minutes for %s classification", [duration_minutes, max_duration, input.resource.classification])
}

violations contains msg if {
    input.action == "upload"
    input.resource.mimeType
    not is_multimedia(input.resource.mimeType)
    startswith(input.resource.mimeType, "audio/")
    msg := sprintf("Unsupported audio format: %s", [input.resource.mimeType])
}

violations contains msg if {
    input.action == "upload"
    input.resource.mimeType
    not is_multimedia(input.resource.mimeType)
    startswith(input.resource.mimeType, "video/")
    msg := sprintf("Unsupported video format: %s", [input.resource.mimeType])
}

# ============================================
# Decision Result
# ============================================

# Full decision with details
decision := {
    "allow": allow_upload,
    "violations": violations,
    "limits": {
        "maxFileSizeMB": max_upload_size_mb(input.resource.classification),
        "maxVideoDurationMinutes": max_video_duration_minutes(input.resource.classification),
    },
    "metadata": {
        "isAudio": is_audio(input.resource.mimeType),
        "isVideo": is_video(input.resource.mimeType),
        "classification": input.resource.classification,
    },
}
