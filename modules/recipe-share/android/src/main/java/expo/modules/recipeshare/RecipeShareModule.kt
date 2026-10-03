package expo.modules.recipeshare

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.net.URLConnection

class ShareOptions : Record {
  @Field
  var message: String? = null

  @Field
  var title: String? = null

  @Field
  var fileUri: String? = null

  @Field
  var mimeType: String? = null
}

/** Android ACTION_SEND chooser that can carry recipe text, a photo, or both (spec #14). */
class RecipeShareModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("RecipeShare")

    AsyncFunction("shareAsync") { options: ShareOptions ->
      val message = options.message?.takeIf { it.isNotBlank() }
      val title = options.title?.takeIf { it.isNotBlank() }
      val fileUri = options.fileUri?.takeIf { it.isNotBlank() }
      if (message == null && fileUri == null) {
        throw IllegalArgumentException("Share needs recipe text, a photo, or both.")
      }

      val intent = Intent(Intent.ACTION_SEND)
      if (title != null) intent.putExtra(Intent.EXTRA_SUBJECT, title)
      if (message != null) intent.putExtra(Intent.EXTRA_TEXT, message)

      if (fileUri != null) {
        val uri = Uri.parse(fileUri)
        if (uri.scheme != "file" || uri.path == null) {
          throw IllegalArgumentException("Photo must be a local file:// URI.")
        }
        val file = File(uri.path!!)
        assertInsideAppStorage(file)
        val contentUri = FileProvider.getUriForFile(
          context,
          context.applicationInfo.packageName + ".RecipeShareFileProvider",
          file,
        )
        val mime = options.mimeType?.takeIf { it.isNotBlank() }
          ?: URLConnection.guessContentTypeFromName(file.name)
          ?: "*/*"
        intent.type = mime
        intent.putExtra(Intent.EXTRA_STREAM, contentUri)
        intent.clipData = ClipData.newRawUri("recipe", contentUri)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val resolved = context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        for (info in resolved) {
          context.grantUriPermission(
            info.activityInfo.packageName,
            contentUri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION,
          )
        }
      } else {
        intent.type = "text/plain"
      }

      val chooser = Intent.createChooser(intent, title ?: "Share recipe")
      appContext.throwingActivity.startActivity(chooser)
    }
  }

  private fun assertInsideAppStorage(file: File) {
    if (!file.exists() || !file.isFile) throw IllegalArgumentException("Photo file does not exist.")
    val path = file.canonicalPath
    val roots = listOf(context.filesDir.canonicalPath, context.cacheDir.canonicalPath)
    if (roots.none { path == it || path.startsWith(it + File.separator) }) {
      throw IllegalArgumentException("Refusing to share a file outside app storage.")
    }
  }
}
