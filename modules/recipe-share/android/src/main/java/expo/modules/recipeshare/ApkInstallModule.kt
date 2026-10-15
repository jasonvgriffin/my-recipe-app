package expo.modules.recipeshare

import android.app.DownloadManager
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Downloads an update with Android's DownloadManager and hands the file to the
 * system package installer (v1.1.4). DownloadManager runs outside this process,
 * so the download continues with the screen locked and shows the system notification.
 * That notification is posted by DownloadManager, not by this app.
 *
 * The finished file is copied into the app cache. installApk only accepts a content
 * URI from `${applicationId}.FileSystemFileProvider`, which exposes cache and files,
 * not the external-files path DownloadManager can write.
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

    AsyncFunction("enqueueApkDownload") { url: String ->
      enqueueApkDownload(url).toDouble()
    }

    AsyncFunction("queryApkDownload") { id: Double ->
      queryApkDownload(id.toLong())
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

  private fun downloadManager(): DownloadManager {
    return context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  }

  private fun enqueueApkDownload(url: String): Long {
    if (!url.startsWith("https://")) throw IllegalArgumentException("Update URL must be https.")
    val manager = downloadManager()
    removePreviousUpdateDownloads(manager)
    val external = context.getExternalFilesDir(null) ?: throw IllegalStateException("No place to store the update.")
    File(external, "updates").mkdirs()
    val destination = File(external, "updates/$APK_NAME")
    if (destination.exists()) destination.delete()
    val request = DownloadManager.Request(Uri.parse(url)).apply {
      setTitle(DOWNLOAD_TITLE)
      setDescription("Downloading the update")
      setMimeType("application/vnd.android.package-archive")
      setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      setDestinationInExternalFilesDir(context, null, "updates/$APK_NAME")
      setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI or DownloadManager.Request.NETWORK_MOBILE)
      setAllowedOverMetered(true)
      setAllowedOverRoaming(true)
      addRequestHeader("Accept", "application/octet-stream")
      addRequestHeader("User-Agent", "MyRecipeApp")
    }
    return manager.enqueue(request)
  }

  private fun queryApkDownload(id: Long): Map<String, Any> {
    val manager = downloadManager()
    val cursor = manager.query(DownloadManager.Query().setFilterById(id))
      ?: return mapOf<String, Any>("state" to "failed")
    cursor.use { rows ->
      if (!rows.moveToFirst()) return mapOf<String, Any>("state" to "failed")
      val status = rows.getInt(rows.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      val bytes = rows.getLong(rows.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
      val total = rows.getLong(rows.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
      return when (status) {
        DownloadManager.STATUS_SUCCESSFUL -> mapOf(
          "state" to "successful",
          "contentUri" to stageForInstaller(manager, id),
          "bytes" to bytes.toDouble(),
          "total" to total.toDouble(),
        )
        DownloadManager.STATUS_FAILED -> mapOf("state" to "failed", "bytes" to bytes.toDouble(), "total" to total.toDouble())
        else -> mapOf("state" to "running", "bytes" to bytes.toDouble(), "total" to total.toDouble())
      }
    }
  }

  /**
   * Copy the DownloadManager file into the cache directory FileSystemFileProvider already shares,
   * then return that content URI for installApk.
   */
  private fun stageForInstaller(manager: DownloadManager, id: Long): String {
    val source = manager.getUriForDownloadedFile(id) ?: throw IllegalStateException("Downloaded update is missing.")
    val dest = File(context.cacheDir, APK_NAME)
    if (dest.exists()) dest.delete()
    context.contentResolver.openInputStream(source).use { input ->
      if (input == null) throw IllegalStateException("Downloaded update is missing.")
      dest.outputStream().use { output -> input.copyTo(output) }
    }
    return FileProvider.getUriForFile(
      context,
      "${context.packageName}.FileSystemFileProvider",
      dest,
    ).toString()
  }

  private fun removePreviousUpdateDownloads(manager: DownloadManager) {
    val ids = mutableListOf<Long>()
    val cursor = manager.query(DownloadManager.Query()) ?: return
    cursor.use { rows ->
      val idIndex = rows.getColumnIndexOrThrow(DownloadManager.COLUMN_ID)
      val titleIndex = rows.getColumnIndex(DownloadManager.COLUMN_TITLE)
      while (rows.moveToNext()) {
        val title = if (titleIndex >= 0) rows.getString(titleIndex) else null
        if (title == DOWNLOAD_TITLE) ids.add(rows.getLong(idIndex))
      }
    }
    if (ids.isNotEmpty()) manager.remove(*ids.toLongArray())
  }

  private companion object {
    const val APK_NAME = "my-recipe-app-update.apk"
    const val DOWNLOAD_TITLE = "My Recipe App update"
  }
}
