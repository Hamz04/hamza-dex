// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ArcToken
 * @author Hamzy
 * @notice ERC-20 token for the ArcSwap ecosystem.
 *         Supports permit (gasless approvals), burnable, and owner-controlled minting.
 * @dev Uses OpenZeppelin v5 contracts. Initial supply is minted to deployer.
 */
contract ArcToken is ERC20, ERC20Burnable, ERC20Permit, Ownable {
    // ─────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────

    /// @notice Maximum total supply cap: 10,000,000 tokens
    uint256 public constant MAX_SUPPLY = 10_000_000 * 10 ** 18;

    /// @notice Initial supply minted to deployer: 1,000,000 tokens
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────

    /// @notice Emitted when new tokens are minted
    event TokensMinted(address indexed to, uint256 amount, uint256 newTotalSupply);

    /// @notice Emitted when tokens are burned
    event TokensBurned(address indexed from, uint256 amount, uint256 newTotalSupply);

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────

    /**
     * @param initialOwner Address that receives ownership and initial supply
     */
    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    ) ERC20(name, symbol) ERC20Permit(name) Ownable(initialOwner) {
        _mint(initialOwner, INITIAL_SUPPLY);
        emit TokensMinted(initialOwner, INITIAL_SUPPLY, totalSupply());
    }

    // ─────────────────────────────────────────────────────────────
    // Owner Functions
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Mint new tokens to a recipient. Only callable by owner.
     * @param to      Recipient address
     * @param amount  Amount to mint (in wei, i.e. with 18 decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "ArcToken: mint to zero address");
        require(amount > 0, "ArcToken: mint amount must be > 0");
        require(totalSupply() + amount <= MAX_SUPPLY, "ArcToken: exceeds max supply");

        _mint(to, amount);
        emit TokensMinted(to, amount, totalSupply());
    }

    // ─────────────────────────────────────────────────────────────
    // Public Functions
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Burn tokens from caller's balance.
     * @param amount Amount to burn (overrides ERC20Burnable for event emission)
     */
    function burn(uint256 amount) public override {
        require(amount > 0, "ArcToken: burn amount must be > 0");
        super.burn(amount);
        emit TokensBurned(msg.sender, amount, totalSupply());
    }

    /**
     * @notice Burn tokens from an allowance. Caller must have approval.
     * @param account Address to burn from
     * @param amount  Amount to burn
     */
    function burnFrom(address account, uint256 amount) public override {
        require(amount > 0, "ArcToken: burn amount must be > 0");
        super.burnFrom(account, amount);
        emit TokensBurned(account, amount, totalSupply());
    }

    // ─────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Returns remaining mintable supply before hitting the cap.
     */
    function remainingMintable() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }
}
