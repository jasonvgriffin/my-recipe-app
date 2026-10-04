package expo.modules.recipeshare

import android.content.ClipData
import android.content.ComponentName
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

    // App icon picker (v1.0.6): launcher icons are <activity-alias> entries `<package>.LauncherIcon<Suffix>` added by
    // plugins/with-alternate-icons.js. Exactly one is enabled; the default alias is the manifest default.
    Function("getAppIcon") { suffixes: List<String> ->
      val pm = context.packageManager
      suffixes.firstOrNull { suffix ->
        val state = pm.getComponentEnabledSetting(ComponentName(context.packageName, "${context.packageName}.$suffix"))
        state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
          (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && suffix == suffixes.first())
      }
    }

    AsyncFunction("setAppIcon") { target: String, suffixes: List<String> ->
      if (target !in suffixes) throw IllegalArgumentException("Unknown app icon")
      val pm = context.packageManager
      fun component(suffix: String) = ComponentName(context.packageName, "${context.packageName}.$suffix")
      // Enable the new launcher entry first, then turn the others off, so there is never zero (or two) for long.
      pm.setComponentEnabledSetting(
        component(target),
        if (target == suffixes.first()) PackageManager.COMPONENT_ENABLED_STATE_DEFAULT else PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP,
      )
      for (suffix in suffixes) {
        if (suffix == target) continue
        pm.setComponentEnabledSetting(
          component(suffix),
          if (suffix == suffixes.first()) PackageManager.COMPONENT_ENABLED_STATE_DISABLED else PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
          PackageManager.DONT_KILL_APP,
        )
      }
      target
    }

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
