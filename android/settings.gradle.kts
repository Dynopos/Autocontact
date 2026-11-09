// Dyno Auto Contact — app Android (WhatsApp Business notification lead capture)
//
// :core — logik tulen Kotlin (tiada kebergantungan Android): baca notifikasi, pengenal,
//         pendua, baris gilir & penghantaran. Diuji pada JVM biasa.
// :app  — app Android: NotificationListenerService, WorkManager, skrin status.
//         Dimasukkan hanya bila Android SDK tersedia (ANDROID_HOME atau local.properties).
// Google Maven hanya untuk artifak Android; lain-lain dari Maven Central.
pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
        google { content { includeGroupByRegex("com\\.android.*|androidx.*|com\\.google\\.android.*|com\\.google\\.testing.*") } }
    }
}
dependencyResolutionManagement {
    repositories {
        mavenCentral()
        google { content { includeGroupByRegex("com\\.android.*|androidx.*|com\\.google\\.android.*|com\\.google\\.testing.*") } }
    }
}
rootProject.name = "dyno-auto-contact"
include(":core")

val sdkTersedia = System.getenv("ANDROID_HOME") != null || System.getenv("ANDROID_SDK_ROOT") != null ||
    file("local.properties").let { it.exists() && it.readText().contains("sdk.dir") }
if (sdkTersedia) include(":app")
