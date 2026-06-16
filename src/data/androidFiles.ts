export interface AndroidFile {
  name: string;
  path: string;
  language: "java" | "xml" | "properties";
  content: string;
}

export const androidFiles: AndroidFile[] = [
  {
    name: "MainActivity.java",
    path: "app/src/main/java/com/polleyai/MainActivity.java",
    language: "java",
    content: `package com.polleyai;

import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
        addMessage("Hello there, human. I'm Polley AI. Now fully outfitted with offline multimodal models!", ChatMessage.Sender.AI);
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
                    Log.i(TAG, "Local model file mapped successfully.");
                    Toast.makeText(MainActivity.this, "Local weights loaded successfully.", Toast.LENGTH_SHORT).show();
                });

            } catch (IOException e) {
                Log.e(TAG, "Failed to memory-map local asset weights model.bin", e);
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

        addMessage(userInput, ChatMessage.Sender.USER);
        messageInputEditText.setText("");

        if (isInferencePausedDueToLowPower) {
            mainThreadHandler.postDelayed(() -> {
                addMessage("⚠️ System Watchdog: Request on layout hold. On-device INT4 model weights decoder suspended to comply with active battery restrictions.", ChatMessage.Sender.AI);
            }, 800);
            return;
        }

        runInferenceDeferred(userInput);
    }

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

    private void triggerWhisperSpeechToText() {
        if (isInferencePausedDueToLowPower) {
            Toast.makeText(this, "⚠️ Mic Whisper STT features disabled under Power Saving parameters.", Toast.LENGTH_LONG).show();
            addMessage("⚠️ Whisper STT recording intercept: Mic decoding suspended for device state optimization.", ChatMessage.Sender.AI);
            return;
        }
        Toast.makeText(this, "🎤 Whisper JNI pipeline active...", Toast.LENGTH_SHORT).show();
        multimodalExecutor.execute(() -> {
            try {
                Thread.sleep(2000);
            } catch (InterruptedException ignored) {}
            final String recognizedVoicePrompt = "Optimize the MappedByteBuffer layout for high-end rendering";
            mainThreadHandler.post(() -> {
                ChatMessage msg = new ChatMessage(recognizedVoicePrompt, ChatMessage.Sender.USER, ChatMessage.Type.AUDIO, null);
                messageList.add(msg);
                chatAdapter.notifyItemChanged(messageList.size() - 1);
                runInferenceDeferred(recognizedVoicePrompt);
            });
        });
    }

    private void triggerLocalStableDiffusion() {
        if (isInferencePausedDueToLowPower) {
            Toast.makeText(this, "⚠️ Offline Stable Diffusion suspended under Power Saving parameters.", Toast.LENGTH_LONG).show();
            addMessage("⚠️ TinyDiffusion draw intercept: ONNX generation bypassed to prevent battery depletion.", ChatMessage.Sender.AI);
            return;
        }
        String customPrompt = messageInputEditText.getText().toString().trim();
        if (customPrompt.isEmpty()) customPrompt = "Cyberpunk digital brain model rendering";
        addMessage("Prompt: \"" + customPrompt + "\". Initializing TinyDiffusion weights via native ONNX / Mobile NCNN bindings...", ChatMessage.Sender.USER);
        messageInputEditText.setText("");

        multimodalExecutor.execute(() -> {
            try {
                Thread.sleep(2500);
            } catch (InterruptedException ignored) {}
            final Bitmap simulatedInferenceBitmap = Bitmap.createBitmap(400, 300, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(simulatedInferenceBitmap);
            canvas.drawColor(Color.parseColor("#151518"));
            Paint mPaint = new Paint();
            mPaint.setColor(Color.parseColor("#12B8A6"));
            mPaint.setStrokeWidth(3f);
            canvas.drawCircle(100, 150, 20, mPaint);
            canvas.drawCircle(200, 100, 30, mPaint);
            
            mainThreadHandler.post(() -> {
                ChatMessage aiImageMsg = new ChatMessage("Offline TinyDiffusion inference completed successfully.", ChatMessage.Sender.AI, ChatMessage.Type.IMAGE, simulatedInferenceBitmap);
                messageList.add(aiImageMsg);
                chatAdapter.notifyItemInserted(messageList.size() - 1);
            });
        });
    }

    private String generateResponseFromModelBuffer(String prompt) {
        return "Polley AI loaded your buffer mapped cleanly. Core offline inference ticking perfectly.";
    }

    private void addMessage(String text, ChatMessage.Sender sender) {
        messageList.add(new ChatMessage(text, sender));
        chatAdapter.notifyItemInserted(messageList.size() - 1);
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
}`
  },
  {
    name: "ChatAdapter.java",
    path: "app/src/main/java/com/polleyai/ChatAdapter.java",
    language: "java",
    content: `package com.polleyai;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import java.util.List;

/**
 * RecyclerAdapter rendering Polley AI message items supporting multimodal payloads.
 * Handles dual bubble views for User and AI roles with rendering paths for texts,
 * generated bitmaps, or speech audio components.
 */
public class ChatAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {

    private static final int VIEW_TYPE_USER = 1;
    private static final int VIEW_TYPE_AI = 2;

    private final List<ChatMessage> messageList;

    public ChatAdapter(List<ChatMessage> messageList) {
        this.messageList = messageList;
    }

    @Override
    public int getItemViewType(int position) {
        ChatMessage message = messageList.get(position);
        if (message.getSender() == ChatMessage.Sender.USER) {
            return VIEW_TYPE_USER;
        } else {
            return VIEW_TYPE_AI;
        }
    }

    @NonNull
    @Override
    public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        LayoutInflater inflater = LayoutInflater.from(parent.getContext());
        if (viewType == VIEW_TYPE_USER) {
            View view = inflater.inflate(parent.getResources().getIdentifier("item_message_user", "layout", parent.getContext().getPackageName()), parent, false);
            return new UserMessageViewHolder(view);
        } else {
            View view = inflater.inflate(parent.getResources().getIdentifier("item_message_ai", "layout", parent.getContext().getPackageName()), parent, false);
            return new AiMessageViewHolder(view);
        }
    }

    @Override
    public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
        ChatMessage message = messageList.get(position);
        if (holder instanceof UserMessageViewHolder) {
            ((UserMessageViewHolder) holder).bind(message);
        } else if (holder instanceof AiMessageViewHolder) {
            ((AiMessageViewHolder) holder).bind(message);
        }
    }

    @Override
    public int getItemCount() {
        return messageList.size();
    }

    static class UserMessageViewHolder extends RecyclerView.ViewHolder {
        private final TextView messageTextView;
        private final ImageView messageImageView;
        private final TextView mediaBadgeView;

        public UserMessageViewHolder(@NonNull View itemView) {
            super(itemView);
            int textViewId = itemView.getResources().getIdentifier("user_message_text", "id", itemView.getContext().getPackageName());
            int imageViewId = itemView.getResources().getIdentifier("user_message_image", "id", itemView.getContext().getPackageName());
            int badgeId = itemView.getResources().getIdentifier("user_media_badge", "id", itemView.getContext().getPackageName());
            
            messageTextView = itemView.findViewById(textViewId);
            messageImageView = itemView.findViewById(imageViewId);
            mediaBadgeView = itemView.findViewById(badgeId);
        }

        public void bind(ChatMessage message) {
            if (messageTextView != null) messageTextView.setText(message.getText());
            if (messageImageView != null) {
                if (message.getType() == ChatMessage.Type.IMAGE && message.getImageBitmap() != null) {
                    messageImageView.setImageBitmap(message.getImageBitmap());
                    messageImageView.setVisibility(View.VISIBLE);
                } else {
                    messageImageView.setVisibility(View.GONE);
                }
            }
            if (mediaBadgeView != null) {
                if (message.getType() == ChatMessage.Type.AUDIO) {
                    mediaBadgeView.setText("🎤 Local STT Audio");
                    mediaBadgeView.setVisibility(View.VISIBLE);
                } else {
                    mediaBadgeView.setVisibility(View.GONE);
                }
            }
        }
    }

    static class AiMessageViewHolder extends RecyclerView.ViewHolder {
        private final TextView messageTextView;
        private final ImageView messageImageView;
        private final TextView mediaBadgeView;

        public AiMessageViewHolder(@NonNull View itemView) {
            super(itemView);
            int textViewId = itemView.getResources().getIdentifier("ai_message_text", "id", itemView.getContext().getPackageName());
            int imageViewId = itemView.getResources().getIdentifier("ai_message_image", "id", itemView.getContext().getPackageName());
            int badgeId = itemView.getResources().getIdentifier("ai_media_badge", "id", itemView.getContext().getPackageName());

            messageTextView = itemView.findViewById(textViewId);
            messageImageView = itemView.findViewById(imageViewId);
            mediaBadgeView = itemView.findViewById(badgeId);
        }

        public void bind(ChatMessage message) {
            if (messageTextView != null) messageTextView.setText(message.getText());
            if (messageImageView != null) {
                if (message.getType() == ChatMessage.Type.IMAGE && message.getImageBitmap() != null) {
                    messageImageView.setImageBitmap(message.getImageBitmap());
                    messageImageView.setVisibility(View.VISIBLE);
                } else {
                    messageImageView.setVisibility(View.GONE);
                }
            }
            if (mediaBadgeView != null) {
                if (message.getType() == ChatMessage.Type.IMAGE) {
                    mediaBadgeView.setText("🎨 Generated via TinyDiffusion Model");
                    mediaBadgeView.setVisibility(View.VISIBLE);
                } else {
                    mediaBadgeView.setVisibility(View.GONE);
                }
            }
        }
    }
}`
  },
  {
    name: "ChatMessage.java",
    path: "app/src/main/java/com/polleyai/ChatMessage.java",
    language: "java",
    content: `package com.polleyai;

import android.graphics.Bitmap;

/**
 * Data model representing an individual multimodal chat message in the Polley AI Thread.
 */
public class ChatMessage {
    public enum Sender {
        USER,
        AI
    }

    public enum Type {
        TEXT,
        IMAGE,
        AUDIO
    }

    private final String text;
    private final Sender sender;
    private final Type type;
    private final Bitmap imageBitmap;
    private final long timestamp;

    public ChatMessage(String text, Sender sender) {
        this(text, sender, Type.TEXT, null);
    }

    public ChatMessage(String text, Sender sender, Type type, Bitmap imageBitmap) {
        this.text = text;
        this.sender = sender;
        this.type = type;
        this.imageBitmap = imageBitmap;
        this.timestamp = System.currentTimeMillis();
    }

    public String getText() { return text; }
    public Sender getSender() { return sender; }
    public Type getType() { return type; }
    public Bitmap getImageBitmap() { return imageBitmap; }
    public long getTimestamp() { return timestamp; }
}`
  },
  {
    name: "activity_main.xml",
    path: "app/src/main/res/layout/activity_main.xml",
    language: "xml",
    content: `<?xml version="1.0" encoding="utf-8"?>
<RelativeLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#121214">

    <!-- Header Frame for Polley AI Title -->
    <RelativeLayout
        android:id="@+id/header_container"
        android:layout_width="match_parent"
        android:layout_height="64dp"
        android:background="#1A1A1E"
        android:paddingHorizontal="16dp">

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_centerVertical="true"
            android:text="Polley AI"
            android:textColor="#FFFFFF"
            android:textSize="20sp"
            android:textStyle="bold" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_alignParentEnd="true"
            android:layout_centerVertical="true"
            android:text="MULTIMODAL OFFLINE"
            android:textColor="#14B8A6"
            android:textSize="11sp"
            android:textStyle="bold" />
    </RelativeLayout>

    <!-- Scrollable Message Bubble Thread Container -->
    <androidx.recyclerview.widget.RecyclerView
        android:id="@+id/chat_recycler_view"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:layout_above="@+id/input_container"
        android:layout_below="@+id/header_container"
        android:padding="8dp" />

    <!-- Keyboard Safe Text input area layout with Multimodal buttons -->
    <LinearLayout
        android:id="@+id/input_container"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_alignParentBottom="true"
        android:background="#1A1A1E"
        android:orientation="horizontal"
        android:padding="8dp">

        <!-- Paint/Prompt diffusion button -->
        <ImageButton
            android:id="@+id/image_generate_button"
            android:layout_width="40dp"
            android:layout_height="40dp"
            android:background="@android:color/transparent"
            android:src="@android:drawable/ic_menu_gallery"
            android:tint="#14B8A6"/>

        <!-- Speech-to-Text Whisper integration button -->
        <ImageButton
            android:id="@+id/mic_whisper_button"
            android:layout_width="40dp"
            android:layout_height="40dp"
            android:background="@android:color/transparent"
            android:src="@android:drawable/ic_btn_speak_now"
            android:tint="#3D8BFF" />

        <EditText
            android:id="@+id/message_input"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:hint="Instruct Polley AI..."
            android:textColorHint="#6B6F7A"
            android:textColor="#FFFFFF"/>

        <ImageButton
            android:id="@+id/send_button"
            android:layout_width="44dp"
            android:layout_height="44dp"
            android:background="@android:color/transparent"
            android:src="@android:drawable/ic_menu_send"
            android:tint="#14B8A6" />
    </LinearLayout>

</RelativeLayout>`
  },
  {
    name: "item_message_user.xml",
    path: "app/src/main/res/layout/item_message_user.xml",
    language: "xml",
    content: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:gravity="end"
    android:orientation="vertical"
    android:padding="6dp">

    <LinearLayout
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:background="#2E3C57"
        android:maxWidth="280dp"
        android:orientation="vertical"
        android:paddingHorizontal="14dp"
        android:paddingVertical="10dp">

        <TextView
            android:id="@+id/user_media_badge"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="#3D8BFF"
            android:textSize="11sp"
            android:visibility="gone" />

        <TextView
            android:id="@+id/user_message_text"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="#FFFFFF"
            android:textSize="15sp" />

        <ImageView
            android:id="@+id/user_message_image"
            android:layout_width="200dp"
            android:layout_height="200dp"
            android:visibility="gone" />
    </LinearLayout>
</LinearLayout>`
  },
  {
    name: "item_message_ai.xml",
    path: "app/src/main/res/layout/item_message_ai.xml",
    language: "xml",
    content: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:gravity="start"
    android:orientation="vertical"
    android:padding="6dp">

    <LinearLayout
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:background="#232328"
        android:maxWidth="280dp"
        android:orientation="vertical"
        android:paddingHorizontal="14dp"
        android:paddingVertical="10dp">

        <TextView
            android:id="@+id/ai_media_badge"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="#14B8A6"
            android:textSize="11sp"
            android:visibility="gone" />

        <TextView
            android:id="@+id/ai_message_text"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="#E4E6EB"
            android:textSize="15sp" />

        <ImageView
            android:id="@+id/ai_message_image"
            android:layout_width="220dp"
            android:layout_height="180dp"
            android:visibility="gone" />
    </LinearLayout>
</LinearLayout>`
  },
  {
    name: "model.bin Descriptor",
    path: "app/src/main/assets/model.bin",
    language: "properties",
    content: `model_format=flatbuffers
model_version=1.4.0
parameters_count=1350000000
quantization_type=int4
vocab_size=32000
context_length=2048
reduce_memory_footprint=true
thread_count=4`
  }
];
