import XCTest

#if !canImport(ObjectiveC)
public func __allTests() -> [XCTestCaseEntry] {
    return [
        testCase(LLSDTests.allTests),
    ]
}
#endif
