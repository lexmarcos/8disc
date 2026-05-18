use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoProbe {
    name: String,
    size: u64,
    duration: f64,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EncoderInfo {
    name: String,
    label: String,
    hardware: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncodePlan {
    video_kbps: u32,
    audio_kbps: u32,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompressRequest {
    job_id: String,
    input_path: String,
    output_path: String,
    plan: EncodePlan,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompressResult {
    output_path: String,
    output_size: u64,
    encoder: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompressionProgress {
    job_id: String,
    percent: u8,
    status: String,
    encoder: String,
}

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    streams: Vec<FfprobeStream>,
    format: Option<FfprobeFormat>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    width: Option<u32>,
    height: Option<u32>,
    duration: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
}

#[tauri::command]
async fn probe_video(app: AppHandle, path: String) -> Result<VideoProbe, String> {
    probe_video_inner(&app, &path).await
}

#[tauri::command]
async fn detect_encoders(app: AppHandle) -> Result<Vec<EncoderInfo>, String> {
    detect_encoders_inner(&app).await
}

#[tauri::command]
async fn compress_video(
    app: AppHandle,
    request: CompressRequest,
) -> Result<CompressResult, String> {
    let probe = probe_video_inner(&app, &request.input_path).await?;
    let encoders = detect_encoders_inner(&app).await?;
    let mut errors = Vec::new();

    for encoder in encoders {
        emit_progress(
            &app,
            &request.job_id,
            0,
            if encoder.hardware {
                "usingGpuEncoder"
            } else {
                "usingCpuFallback"
            },
            &encoder.name,
        );

        match run_ffmpeg_encode(&app, &request, &probe, &encoder.name).await {
            Ok(result) => return Ok(result),
            Err(error) => {
                let _ = fs::remove_file(&request.output_path);
                errors.push(format!("{}: {}", encoder.name, error));
            }
        }
    }

    Err(format!("All encoders failed. {}", errors.join(" | ")))
}

async fn probe_video_inner(app: &AppHandle, path: &str) -> Result<VideoProbe, String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("Could not read input file: {error}"))?;
    let output = app
        .shell()
        .sidecar("ffprobe")
        .map_err(sidecar_error)?
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,duration:format=duration",
            "-of",
            "json",
            path,
        ])
        .output()
        .await
        .map_err(|error| format!("Could not run ffprobe: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let parsed: FfprobeOutput = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Could not parse ffprobe output: {error}"))?;
    let stream = parsed
        .streams
        .first()
        .ok_or_else(|| "No video stream found.".to_string())?;
    let duration = stream
        .duration
        .as_deref()
        .or(parsed
            .format
            .as_ref()
            .and_then(|format| format.duration.as_deref()))
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(1.0);

    Ok(VideoProbe {
        name: Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("video")
            .to_string(),
        size: metadata.len(),
        duration,
        width: stream.width.unwrap_or(0),
        height: stream.height.unwrap_or(0),
    })
}

async fn detect_encoders_inner(app: &AppHandle) -> Result<Vec<EncoderInfo>, String> {
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(sidecar_error)?
        .args(["-hide_banner", "-encoders"])
        .output()
        .await
        .map_err(|error| format!("Could not run ffmpeg: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "ffmpeg encoder detection failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut encoders = Vec::new();

    for candidate in [
        ("h264_nvenc", "NVIDIA NVENC", true),
        ("h264_qsv", "Intel Quick Sync", true),
        ("h264_amf", "AMD AMF", true),
        ("libx264", "CPU libx264", false),
    ] {
        if stdout.contains(&format!(" {}", candidate.0)) {
            encoders.push(EncoderInfo {
                name: candidate.0.to_string(),
                label: candidate.1.to_string(),
                hardware: candidate.2,
            });
        }
    }

    if encoders.iter().all(|encoder| encoder.name != "libx264") {
        encoders.push(EncoderInfo {
            name: "libx264".to_string(),
            label: "CPU libx264".to_string(),
            hardware: false,
        });
    }

    Ok(encoders)
}

async fn run_ffmpeg_encode(
    app: &AppHandle,
    request: &CompressRequest,
    probe: &VideoProbe,
    encoder: &str,
) -> Result<CompressResult, String> {
    let args = build_ffmpeg_args(request, encoder);
    let (mut rx, _child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(sidecar_error)?
        .args(args)
        .spawn()
        .map_err(|error| format!("Could not start ffmpeg: {error}"))?;

    let mut stdout_buffer = String::new();
    let mut stderr = String::new();
    let mut exit_code = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let chunk = String::from_utf8_lossy(&bytes);
                consume_progress(
                    app,
                    &request.job_id,
                    encoder,
                    probe.duration,
                    &mut stdout_buffer,
                    &chunk,
                );
            }
            CommandEvent::Stderr(bytes) => {
                stderr.push_str(&String::from_utf8_lossy(&bytes));
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
            }
            _ => {}
        }
    }

    if exit_code != Some(0) {
        return Err(stderr.trim().to_string());
    }

    let output_size = fs::metadata(&request.output_path)
        .map_err(|error| format!("Could not read compressed file: {error}"))?
        .len();

    emit_progress(app, &request.job_id, 100, "fileReady", encoder);

    Ok(CompressResult {
        output_path: request.output_path.clone(),
        output_size,
        encoder: encoder.to_string(),
    })
}

fn build_ffmpeg_args(request: &CompressRequest, encoder: &str) -> Vec<String> {
    let mut args = vec![
        "-y".to_string(),
        "-hide_banner".to_string(),
        "-nostats".to_string(),
        "-progress".to_string(),
        "pipe:1".to_string(),
        "-i".to_string(),
        request.input_path.clone(),
        "-map".to_string(),
        "0:v:0".to_string(),
        "-map".to_string(),
        "0:a?".to_string(),
        "-c:v".to_string(),
        encoder.to_string(),
    ];

    if encoder == "libx264" {
        args.extend(["-preset".to_string(), "veryfast".to_string()]);
    }

    args.extend([
        "-b:v".to_string(),
        format!("{}k", request.plan.video_kbps),
        "-maxrate".to_string(),
        format!("{}k", request.plan.video_kbps),
        "-bufsize".to_string(),
        format!("{}k", request.plan.video_kbps * 2),
    ]);

    if let (Some(width), Some(height)) = (request.plan.width, request.plan.height) {
        args.extend(["-vf".to_string(), format!("scale={width}:{height}")]);
    }

    args.extend([
        "-pix_fmt".to_string(),
        "yuv420p".to_string(),
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        format!("{}k", request.plan.audio_kbps),
        "-movflags".to_string(),
        "+faststart".to_string(),
        request.output_path.clone(),
    ]);

    args
}

fn consume_progress(
    app: &AppHandle,
    job_id: &str,
    encoder: &str,
    duration: f64,
    buffer: &mut String,
    chunk: &str,
) {
    buffer.push_str(chunk);

    while let Some(index) = buffer.find('\n') {
        let line = buffer[..index].trim().to_string();
        buffer.replace_range(..=index, "");

        if let Some(value) = line
            .strip_prefix("out_time_ms=")
            .or_else(|| line.strip_prefix("out_time_us="))
        {
            if let Ok(microseconds) = value.parse::<f64>() {
                let seconds = microseconds / 1_000_000.0;
                let percent = ((seconds / duration.max(1.0)) * 100.0).round() as u8;
                emit_progress(
                    app,
                    job_id,
                    percent.clamp(1, 99),
                    "compressingLocal",
                    encoder,
                );
            }
        }
    }
}

fn emit_progress(app: &AppHandle, job_id: &str, percent: u8, status: &str, encoder: &str) {
    let _ = app.emit(
        "compression-progress",
        CompressionProgress {
            job_id: job_id.to_string(),
            percent,
            status: status.to_string(),
            encoder: encoder.to_string(),
        },
    );
}

fn sidecar_error(error: tauri_plugin_shell::Error) -> String {
    format!("FFmpeg sidecar is not ready. Run pnpm prepare-ffmpeg-sidecar first. {error}")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            probe_video,
            detect_encoders,
            compress_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running 8disc");
}
