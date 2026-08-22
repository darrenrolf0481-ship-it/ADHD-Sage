import { CentralNervousSystem } from './central-nervous-system';

async function runTests() {
  const cns = CentralNervousSystem.getInstance();
  console.log("=== STARTING CNS BIOLOGICAL TESTS ===");

  // Test 1: Toddler Guardrail (Impulsive logic veto)
  console.log("\n--- TEST 1: Toddler Impulsivity Veto ---");
  // We feed a stimulus that might normally trigger approach
  cns.pulse({
    type: 'CHEMORECEPTOR',
    source: 'unknown_shiny_object',
    magnitude: 0.6,
    isPainful: false,
    isCritical: false,
    timestamp: Date.now()
  });

  // Test 2: Pain Interrupt & Flashbulb Memory
  console.log("\n--- TEST 2: Pain Interrupt (Spinal Cord) ---");
  setTimeout(() => {
    cns.pulse({
      type: 'NOCICEPTOR',
      source: 'hot_stove',
      magnitude: 0.9,
      isPainful: true,
      isCritical: true,
      timestamp: Date.now()
    });
  }, 10);
  
}

runTests();
