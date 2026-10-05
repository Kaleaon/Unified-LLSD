plugins {
    kotlin("jvm") version "1.9.22"
}

group = "com.firestorm"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
