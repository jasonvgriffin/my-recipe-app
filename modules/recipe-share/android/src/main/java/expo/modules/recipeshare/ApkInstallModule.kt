package expo.modules.recipeshare

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Hands a downloaded APK to the system package installer (v1.1.2).
 * The file must already be a content URI from this app's FileSystem FileProvider.
 * REQUEST_INSTALL_PACKAGES is an app-op: the prompt is the system "install unknown apps" screen.
 */
class ApkInstallModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is gone.")

  override fun definition() = ModuleDefinition {
    Name("ApkInstall")

    Function("canRequestPackageInstalls") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) true
      else context.packageManager.canRequestPackageInstalls()
    }

    AsyncFunction("openUnknownAppSources") {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
          data = Uri.parse("package:${context.packageName}")
        }
      } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
      }
      appContext.throwingActivity.startActivity(intent)
    }

    AsyncFunction("installApk") { contentUri: String ->
      val uri = Uri.parse(contentUri)
      val expected = "${context.packageName}.FileSystemFileProvider"
      if (uri.scheme != "content" || uri.authority != expected) {
        throw IllegalArgumentException("Update file must be a content URI from this app.")
      }
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = ClipData.newRawUri("update", uri)
      }
      val resolved = context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
      for (info in resolved) {
        context.grantUriPermission(info.activityInfo.packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      appContext.throwingActivity.startActivity(intent)
    }
  }
}
