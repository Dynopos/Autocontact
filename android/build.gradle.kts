// Plugin Android (AGP) diisytiharkan dalam app/build.gradle.kts supaya modul :core
// boleh dibina di persekitaran tanpa Android SDK / Google Maven.
plugins {
    kotlin("jvm") version "2.0.21" apply false
}
