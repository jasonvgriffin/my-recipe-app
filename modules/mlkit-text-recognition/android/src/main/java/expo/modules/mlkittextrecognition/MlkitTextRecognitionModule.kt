package expo.modules.mlkittextrecognition

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MlkitTextRecognitionModule : Module() {
  // Reuse the client; Google recommends one recognizer per process.
  private val recognizer: TextRecognizer by lazy {
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  }

  override fun definition() = ModuleDefinition {
    Name("MlkitTextRecognition")

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_NO_CONTEXT", "React context is unavailable.", null)
        return@AsyncFunction
      }
      try {
        val image = InputImage.fromFilePath(context, Uri.parse(uri))
        recognizer
          .process(image)
          .addOnSuccessListener { visionText ->
            promise.resolve(visionText.text ?: "")
          }
          .addOnFailureListener { error ->
            promise.reject("E_OCR_FAILED", error.message ?: "Text recognition failed.", error)
          }
      } catch (error: Exception) {
        promise.reject("E_OCR_FAILED", error.message ?: "Could not read the image.", error)
      }
    }
  }
}
