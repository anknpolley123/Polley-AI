package com.polleyai;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.BatteryManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Main Activity managing Polley AI engine initialization, UI event dispatching,
 * and high-performance, non-blocking Memory-Mapped model loading from application assets.
 * Now expanded with multimodal features: offline image generation (ONNX/NCNN mockup draw), 
 * offline Speak (TextToSpeech), and speech input (Whisper JNI mockup decoder).
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "MainActivity";
    private static final String MODEL_ASSET_NAME = "model.bin";

    // UI elements
    private RecyclerView chatRecyclerView;
    private EditText messageInputEditText;
    private ImageButton sendMessageButton;
    private ImageButton imageGenerateButton;
    private ImageButton micWhisperButton;

    // Chat adapter and list
    private ChatAdapter chatAdapter;
    private final List<ChatMessage> messageList = new ArrayList<>();

    // Multi-threaded execution pipelines
    private final ExecutorService modelInferenceExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService multimodalExecutor = Executors.newFixedThreadPool(2);
    private final Handler mainThreadHandler = new Handler(Looper.getMainLooper());

    // High performance Memory-Mapped Buffer for Multi-Gigabyte LLM access
    private MappedByteBuffer modelMemoryBuffer;

    // Native Offline TTS Engine
    private TextToSpeech offlineTtsEngine;
    private boolean ttsReady = false;

    // Battery and Low-Power Monitoring variables
    private boolean isInferencePausedDueToLowPower = false;
    private BroadcastReceiver batteryMonitoringReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(getLayoutResourceId("activity_main"));

        initializeViews();
        initializeChatAdapter();
        loadLocalModelNonBlocking();
        initializeOfflineTts();
        initializeBatteryMonitoringService();
    }

    private void initializeViews() {
        chatRecyclerView = findViewById(getViewId("chat_recycler_view"));
        messageInputEditText = findViewById(getViewId("message_input"));
        sendMessageButton = findViewById(getViewId("send_button"));
        imageGenerateButton = findViewById(getViewId("image_generate_button"));
        micWhisperButton = findViewById(getViewId("mic_whisper_button"));

        sendMessageButton.setOnClickListener(v -> dispatchMessage());
        imageGenerateButton.setOnClickListener(v -> triggerLocalStableDiffusion());
        micWhisperButton.setOnClickListener(v -> triggerWhisperSpeechToText());
    }

    private void initializeChatAdapter() {
        chatAdapter = new ChatAdapter(messageList);
        chatRecyclerView.setLayoutManager(new LinearLayoutManager(this));
        chatRecyclerView.setAdapter(chatAdapter);

        // Welcoming prompt from Polley AI
        addMessage("Hello there, human. I'm Polley AI. Now fully outfitted with offline multimodal models! I support local image generation via TinyDiffusion, Whisper.cpp STT inputs, and native TTS speech streaming.", ChatMessage.Sender.AI);
    }

    /**
     * Maps the massive multi-gigabyte models into system virtual memory.
     * Uses AssetFileDescriptor, FileInputStream, and FileChannel to execute a zero-copy map-to-RAM.
     * This bypasses the Android heap memory completely, protecting the JVM from Out-Of-Memory exceptions.
     */
    private void loadLocalModelNonBlocking() {
        modelInferenceExecutor.execute(() -> {
            Log.d(TAG, "Starting non-blocking memory map allocation of " + MODEL_ASSET_NAME);
            try {
                AssetFileDescriptor fileDescriptor = getAssets().openFd(MODEL_ASSET_NAME);
                FileInputStream inputStream = new FileInputStream(fileDescriptor.getFileDescriptor());
                FileChannel fileChannel = inputStream.getChannel();

                long startOffset = fileDescriptor.getStartOffset();
                long declaredLength = fileDescriptor.getDeclaredLength();

                // Memory map the file strictly in READ_ONLY mode.
                modelMemoryBuffer = fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength);
                
                mainThreadHandler.post(() -> {
                    Log.i(TAG, "Local model file mapped successfully. Mapped buffer address allocated.");
                    Toast.makeText(MainActivity.this, "Local weights loaded successfully.", Toast.LENGTH_SHORT).show();
                });

            } catch (IOException e) {
                Log.e(TAG, "Failed to memory-map local asset weights model.bin", e);
                mainThreadHandler.post(() -> {
                    Toast.makeText(MainActivity.this, "Error initializing local weight mapping.", Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    /**
     * Set up Native TextToSpeech in OFFLINE mode
     */
    private void initializeOfflineTts() {
        offlineTtsEngine = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int result = offlineTtsEngine.setLanguage(Locale.US);
                if (result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED) {
                    ttsReady = true;
                    Log.i(TAG, "Offline Android TTS initialization completed successfully.");
                }
            } else {
                Log.e(TAG, "TTS Engine initialization failed.");
            }
        });
    }

    private void playOfflineAudioSpeech(String text) {
        if (ttsReady && offlineTtsEngine != null) {
            offlineTtsEngine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "PolleyTtsMsgId");
        }
    }

    private void dispatchMessage() {
        String userInput = messageInputEditText.getText().toString().trim();
        if (userInput.isEmpty()) return;

        // Display user message
        addMessage(userInput, ChatMessage.Sender.USER);
        messageInputEditText.setText("");

        if (isInferencePausedDueToLowPower) {
            mainThreadHandler.postDelayed(() -> {
                addMessage("⚠️ System Watchdog: Request on layout hold. On-device INT4 model weights decoder suspended to comply with active battery restrictions.", ChatMessage.Sender.AI);
            }, 800);
            return;
        }

        // Run Local LLM Inference offset from main UI thread to protect UI frame rate
        runInferenceDeferred(userInput);
    }

    /**
     * Executes local prediction and token scanning inside background Executors.
     */
    private void runInferenceDeferred(final String promptText) {
        modelInferenceExecutor.execute(() -> {
            try {
                Thread.sleep(1000 + (long)(Math.random() * 800));
            } catch (InterruptedException ignored) {}

            final String aiReplyResponse = generateResponseFromModelBuffer(promptText);

            mainThreadHandler.post(() -> {
                addMessage(aiReplyResponse, ChatMessage.Sender.AI);
                playOfflineAudioSpeech(aiReplyResponse);
            });
        });
    }

    /**
     * Simulates Whisper JNI Whisper.cpp speech decoding
     */
    private void triggerWhisperSpeechToText() {
        if (isInferencePausedDueToLowPower) {
            Toast.makeText(this, "⚠️ Mic Whisper STT features disabled under Power Saving parameters.", Toast.LENGTH_LONG).show();
            addMessage("⚠️ Whisper STT recording intercept: Mic decoding suspended for device state optimization.", ChatMessage.Sender.AI);
            return;
        }
        Toast.makeText(this, "🎤 Whisper JNI pipeline: Listening to local microphone stream...", Toast.LENGTH_SHORT).show();
        
        multimodalExecutor.execute(() -> {
            try {
                // Emulate audio capturing and whisper decode sequence
                Thread.sleep(2000);
            } catch (InterruptedException ignored) {}

            final String recognizedVoicePrompt = "Optimize the MappedByteBuffer layout for high-end rendering";
            
            mainThreadHandler.post(() -> {
                // Add message as AUDIO voice type
                ChatMessage msg = new ChatMessage(recognizedVoicePrompt, ChatMessage.Sender.USER, ChatMessage.Type.AUDIO, null);
                messageList.add(msg);
                chatAdapter.notifyItemInserted(messageList.size() - 1);
                chatRecyclerView.scrollToPosition(messageList.size() - 1);
                
                // Immediately pipe into LLM execution
                runInferenceDeferred(recognizedVoicePrompt);
            });
        });
    }

    /**
     * Executes offline Stable Diffusion / TinyDiffusion text-to-image simulation.
     * Dynamically constructs a graphic Bitmap on background threads using Native Canvas contexts to represent real runtime rendering outputs.
     */
    private void triggerLocalStableDiffusion() {
        if (isInferencePausedDueToLowPower) {
            Toast.makeText(this, "⚠️ Offline Stable Diffusion suspended under Power Saving parameters.", Toast.LENGTH_LONG).show();
            addMessage("⚠️ TinyDiffusion draw intercept: ONNX generation bypassed to prevent battery depletion.", ChatMessage.Sender.AI);
            return;
        }
        String customPrompt = messageInputEditText.getText().toString().trim();
        if (customPrompt.isEmpty()) {
            customPrompt = "Cyberpunk digital brain model rendering";
        }
        
        final String imagePrompt = customPrompt;
        addMessage("Prompt: \"" + imagePrompt + "\". Initializing TinyDiffusion weights via native ONNX / Mobile NCNN bindings...", ChatMessage.Sender.USER);
        messageInputEditText.setText("");

        Toast.makeText(this, "🎨 Generating local image bitmap...", Toast.LENGTH_SHORT).show();

        multimodalExecutor.execute(() -> {
            try {
                // Emulate heavy diffusion loop
                Thread.sleep(2500);
            } catch (InterruptedException ignored) {}

            // Programmatically construct beautiful graphic showcase
            final Bitmap simulatedInferenceBitmap = Bitmap.createBitmap(400, 300, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(simulatedInferenceBitmap);
            
            // Background fill
            canvas.drawColor(Color.parseColor("#151518"));
            
            // Drawing tech grids
            Paint mPaint = new Paint();
            mPaint.setColor(Color.parseColor("#12B8A6"));
            mPaint.setStrokeWidth(3f);
            mPaint.setStyle(Paint.Style.STROKE);
            
            // Draw a symbolic glowing neural neural network nodes/network paths
            canvas.drawCircle(100, 150, 20, mPaint);
            canvas.drawCircle(200, 100, 30, mPaint);
            canvas.drawCircle(200, 200, 35, mPaint);
            canvas.drawCircle(300, 150, 25, mPaint);
            
            canvas.drawLine(120, 150, 170, 100, mPaint);
            canvas.drawLine(120, 150, 165, 200, mPaint);
            canvas.drawLine(230, 100, 275, 150, mPaint);
            canvas.drawLine(235, 200, 275, 150, mPaint);

            // Tech labels
            mPaint.setStyle(Paint.Style.FILL);
            mPaint.setColor(Color.WHITE);
            mPaint.setTextSize(18f);
            canvas.drawText("TinyDiffusion 1.3B", 25, 270, mPaint);
            
            mPaint.setColor(Color.parseColor("#3D8BFF"));
            canvas.drawText("INT4_QUANT", 250, 270, mPaint);

            mainThreadHandler.post(() -> {
                ChatMessage aiImageMsg = new ChatMessage("Offline TinyDiffusion inference completed successfully for prompt: \"" + imagePrompt + "\". Matrix dimensions 400x300, zero-copy buffer retained.", ChatMessage.Sender.AI, ChatMessage.Type.IMAGE, simulatedInferenceBitmap);
                messageList.add(aiImageMsg);
                chatAdapter.notifyItemInserted(messageList.size() - 1);
                chatRecyclerView.scrollToPosition(messageList.size() - 1);
            });
        });
    }

    /**
     * Simulated token decoder reading features from the zero-copy MappedByteBuffer
     */
    private String generateResponseFromModelBuffer(String prompt) {
        if (modelMemoryBuffer == null) {
            return "Polley AI: Local weights model.bin have not been mapped yet. Be patient while the pointers resolve.";
        }

        String sanitized = prompt.toLowerCase();
        if (sanitized.contains("hello") || sanitized.contains("hi")) {
            return "Greetings! How can this highly customized, offline-first digital intellect assist you today?";
        } else if (sanitized.contains("why") || sanitized.contains("how")) {
            return "That requires deep local neural calculations. According to our 1.3B INT4 quantized parameters, the zero-copy MappedByteBuffer is performing flawlessly.";
        } else if (sanitized.contains("code") || sanitized.contains("android") || sanitized.contains("mapped")) {
            return "Ah, the architectural beauty. By memory-allocating model.bin through FileChannel, we're mapping files directly into virtual memory blocks (VirtualAlloc) bypassing JVM Heap completely.";
        } else if (sanitized.contains("image") || sanitized.contains("generate") || sanitized.contains("diffusion")) {
            return "TinyDiffusion yields optimized results on and off the layout threads. Just hit the Image gallery button to render programmatically!";
        } else if (sanitized.contains("whisper") || sanitized.contains("voice") || sanitized.contains("audio")) {
            return "Whisper JNI decoded that voice input in less than 200ms. All memory accesses are handled safely via Executors.";
        } else {
            return "Analysis complete. Weights mapped cleanly via zero-copy. Ready for the next development directive.";
        }
    }

    private void addMessage(String text, ChatMessage.Sender sender) {
        messageList.add(new ChatMessage(text, sender));
        chatAdapter.notifyItemInserted(messageList.size() - 1);
        chatRecyclerView.scrollToPosition(messageList.size() - 1);
    }

    private int getLayoutResourceId(String name) {
        return getResources().getIdentifier(name, "layout", getPackageName());
    }

    private int getViewId(String name) {
        return getResources().getIdentifier(name, "id", getPackageName());
    }

    private void initializeBatteryMonitoringService() {
        batteryMonitoringReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (Intent.ACTION_BATTERY_CHANGED.equals(action)) {
                    int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                    int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                    float batteryPct = (level / (float) scale) * 100f;
                    
                    PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    boolean isPowerSaveMode = (powerManager != null && powerManager.isPowerSaveMode());
                    boolean criticalLow = (batteryPct <= 15f) || isPowerSaveMode;
                    
                    if (criticalLow != isInferencePausedDueToLowPower) {
                        isInferencePausedDueToLowPower = criticalLow;
                        if (isInferencePausedDueToLowPower) {
                            Log.w(TAG, "Low-power state recognized (" + batteryPct + "% / PowerSave=" + isPowerSaveMode + "). Suspended local models' inference pipeline.");
                            Toast.makeText(MainActivity.this, "Critical Low-Power Mode active. Heavy inference suspended.", Toast.LENGTH_LONG).show();
                            addMessage("⚠️ Battery Service: Decoupled model weights executor to optimize power usage (" + (int)batteryPct + "% remaining).", ChatMessage.Sender.AI);
                        } else {
                            Log.i(TAG, "Normal power status restored (" + batteryPct + "%). Resuming inference pipeline.");
                            Toast.makeText(MainActivity.this, "Normal power restored. Inference pipelines resumed.", Toast.LENGTH_SHORT).show();
                            addMessage("⚡ Battery Service: Optimal charge detected. Core multi-threaded ONNX / whisper executions reactivated.", ChatMessage.Sender.AI);
                        }
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        registerReceiver(batteryMonitoringReceiver, filter);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (offlineTtsEngine != null) {
            offlineTtsEngine.stop();
            offlineTtsEngine.shutdown();
        }
        if (batteryMonitoringReceiver != null) {
            unregisterReceiver(batteryMonitoringReceiver);
        }
        modelInferenceExecutor.shutdown();
        multimodalExecutor.shutdown();
    }
}
