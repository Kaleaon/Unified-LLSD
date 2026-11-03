plugins {
    kotlin("jvm") version "1.9.22"
}

group = "com.firestorm"
version = "1.0.0"

repositories {
    maven("https://maven-central.storage-download.googleapis.com/maven2/")
    mavenCentral()
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
