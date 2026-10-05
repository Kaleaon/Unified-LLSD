plugins {
    kotlin("jvm")
}

group = "com.firestorm"
version = "1.0.0"

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
