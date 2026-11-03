plugins {
    kotlin("jvm") version "2.1.0" apply false
    `maven-publish`
}

allprojects {
    group = "com.unifiedllsd"
    version = "1.0.0"
}

subprojects {
    apply(plugin = "org.jetbrains.kotlin.jvm")
    apply(plugin = "java")

    configure<JavaPluginExtension> {
        toolchain {
            languageVersion.set(JavaLanguageVersion.of(21))
        }
    }
}
