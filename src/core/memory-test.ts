import { sageEndocrine, sageMemory } from './endocrine-memory';
import { CentralNervousSystem } from './central-nervous-system';

async function testMemoryAndEndocrine() {
  console.log("=== BIOLOGICAL MEMORY & ENDOCRINE TEST ===");
  
  // 1. Initial State
  console.log(`\n--- Initial State ---`);
  console.log(`Cortisol (Stress): ${sageEndocrine.hormones.cortisol}`);
  console.log(`Dopamine (Reward): ${sageEndocrine.hormones.dopamine}`);
  let depth = sageMemory.retrieveRelevant("test context", sageEndocrine.hormones.cortisol).length;
  console.log(`Calculated Search Depth at ${sageEndocrine.hormones.cortisol} cortisol: ~${Math.max(1, Math.floor(10 * (1.0 - sageEndocrine.hormones.cortisol)))}`);

  // 2. Add some dummy memories so retrieveRelevant has things to return
  for(let i=0; i<15; i++) {
    sageMemory.store({
      perception: `Test Memory ${i}`,
      intent: 'test',
      sentiment: 0.5,
      outcomeValue: 0.5,
      importance: 0.5,
      timestamp: Date.now()
    });
  }

  // 3. Process a Pain Event
  console.log(`\n--- Applying Severe Pain Event (Intensity 0.9) ---`);
  sageEndocrine.processPain(0.9);
  console.log(`Cortisol (Stress) SPIKE: ${sageEndocrine.hormones.cortisol.toFixed(2)}`);
  console.log(`Dopamine DROP: ${sageEndocrine.hormones.dopamine.toFixed(2)}`);

  let maxResults = Math.max(1, Math.floor(10 * (1.0 - sageEndocrine.hormones.cortisol)));
  console.log(`Expected Search Depth at ${sageEndocrine.hormones.cortisol.toFixed(2)} cortisol: limited to ${maxResults}`);
  let hits = sageMemory.retrieveRelevant("Test Memory", sageEndocrine.hormones.cortisol);
  console.log(`Actual Memories Retrieved: ${hits.length}`);

  // 4. Test Flashbulb via CNS
  console.log(`\n--- Testing Flashbulb Generation (CNS) ---`);
  const cns = CentralNervousSystem.getInstance();
  // Spy on memory storage
  const originalStore = sageMemory.store.bind(sageMemory);
  let flashbulbCreated = false;
  sageMemory.store = (exp) => {
    if (exp.importance === 1.0 && exp.sentiment === -1.0) {
      flashbulbCreated = true;
      console.log(`FLASHBULB MEMORY INTERCEPTED: ${exp.perception}`);
    }
    originalStore(exp);
  };

  cns.pulse({
    type: 'NOCICEPTOR',
    source: 'electric_shock',
    magnitude: 0.95,
    isPainful: true,
    isCritical: true,
    timestamp: Date.now()
  });

  if (flashbulbCreated) {
    console.log("SUCCESS: Flashbulb memory was successfully forced into STM!");
  } else {
    console.log("FAIL: Flashbulb memory was NOT generated.");
  }
}

testMemoryAndEndocrine();
