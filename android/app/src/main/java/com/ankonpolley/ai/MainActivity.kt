package com.ankonpolley.ai

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import java.io.File
import java.io.FileOutputStream

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Run the file-stitching engine immediately when the app starts
        mergeModelParts(this)

        // 2. Check if the unified file is officially ready to use
        val fullModelFile = File(filesDir, "model.bin")
        if (fullModelFile.exists()) {
            Log.d("AI_BUILD", "Model is unified and ready at: ${fullModelFile.absolutePath}")
        }

        setContent {
            Greeting("Android")
        }
    }

    // --- AUTOMATIC FILE STITCHER ENGINE ---
    private fun mergeModelParts(context: android.content.Context) {
        val assetsManager = context.assets
        // The final unified model will live safely inside the app's internal device storage
        val outputFile = File(context.filesDir, "model.bin") 

        // Only run the stitcher if the file hasn't been put together yet
        if (!outputFile.exists()) {
            try {
                FileOutputStream(outputFile).use { outputStream ->
                    // Loops pieces automatically from model_part_aa to model_part_az
                    for (char in 'a'..'z') {
                        val partName = "model_part_a$char"

                        assetsManager.open(partName).use { inputStream ->
                            val buffer = ByteArray(1024 * 4) // 4KB buffer data blocks
                            var bytesRead: Int
                            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                                outputStream.write(buffer, 0, bytesRead)
                            }
                        }
                    }
                }
                Log.d("AI_BUILD", "Success! All 50MB packages stitched back into a single model file.")
            } catch (e: Exception) {
                Log.e("AI_BUILD", "Reconstruction failed: ${e.message}")
                e.printStackTrace()
            }
        } else {
            Log.d("AI_BUILD", "Model file already exists. Skipping stitching process.")
        }
    }
}

@Composable
fun Greeting(name: String) {
    Text(text = "Hello $name!")
}

@Preview(showBackground = true)
@Composable
fun DefaultPreview() {
    Greeting("Android")
}
